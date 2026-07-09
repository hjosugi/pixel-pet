#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{
    fs,
    io::ErrorKind,
    path::{Path, PathBuf},
};

use serde::{Deserialize, Serialize};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, WindowEvent,
};

const STATE_SCHEMA_VERSION: u32 = 1;
const STATE_FILE_NAME: &str = "pet-state.v1.json";
const ACTIVITY_INBOX_FILE_NAME: &str = "activity-inbox.jsonl";
const ACTIVITY_INBOX_MAX_EVENTS: usize = 50;

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct StoredPetState {
    schema_version: u32,
    state: serde_json::Value,
}

fn state_file_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|error| format!("resolve app data dir: {error}"))?
        .join(STATE_FILE_NAME))
}

const PACKS_DIR_NAME: &str = "packs";

/// A community pet pack read from the user packs directory. The frontend
/// validates and assembles these; the backend only reads raw files.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ExternalPetPack {
    dir: String,
    manifest: serde_json::Value,
    metadata: serde_json::Value,
    sprite_png: Vec<u8>,
}

fn packs_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|error| format!("resolve app data dir: {error}"))?
        .join(PACKS_DIR_NAME))
}

/// Reject asset names that could escape the pack directory. Pack manifests may
/// declare their spritesheet/metadata file names, so keep them to plain files.
fn safe_asset_name(value: Option<&str>, default: &str) -> Option<String> {
    let name = value.unwrap_or(default);
    if name.is_empty() || name.contains('/') || name.contains('\\') || name.contains("..") {
        return None;
    }
    Some(name.to_string())
}

fn read_external_pack(path: &Path) -> Option<ExternalPetPack> {
    let dir = path.file_name()?.to_str()?.to_string();

    let manifest_raw = fs::read_to_string(path.join("manifest.json")).ok()?;
    let manifest: serde_json::Value = serde_json::from_str(&manifest_raw).ok()?;

    let assets = manifest.get("assets");
    let metadata_name = safe_asset_name(
        assets.and_then(|a| a.get("metadata")).and_then(|v| v.as_str()),
        "spritesheet.json",
    )?;
    let sprite_name = safe_asset_name(
        assets.and_then(|a| a.get("spritesheet")).and_then(|v| v.as_str()),
        "spritesheet.png",
    )?;

    let metadata_raw = fs::read_to_string(path.join(&metadata_name)).ok()?;
    let metadata: serde_json::Value = serde_json::from_str(&metadata_raw).ok()?;
    let sprite_png = fs::read(path.join(&sprite_name)).ok()?;

    Some(ExternalPetPack {
        dir,
        manifest,
        metadata,
        sprite_png,
    })
}

#[tauri::command]
fn list_external_pet_packs(app: AppHandle) -> Result<Vec<ExternalPetPack>, String> {
    let dir = packs_dir(&app)?;
    let entries = match fs::read_dir(&dir) {
        Ok(entries) => entries,
        Err(error) if error.kind() == ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => return Err(format!("read packs dir: {error}")),
    };

    let mut packs = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            if let Some(pack) = read_external_pack(&path) {
                packs.push(pack);
            }
        }
    }

    Ok(packs)
}

fn activity_inbox_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|error| format!("resolve app data dir: {error}"))?
        .join(ACTIVITY_INBOX_FILE_NAME))
}

/// Read and clear the local activity inbox. A host (for example a Claude Code
/// hook) appends one JSON activity object per line to this file; the webview
/// drains it on a low-frequency poll. Best-effort and local-only: the file is
/// removed after reading, malformed lines are skipped, and only the most recent
/// events are returned so a runaway writer cannot flood the pet.
#[tauri::command]
fn drain_activity_inbox(app: AppHandle) -> Result<Vec<serde_json::Value>, String> {
    let path = activity_inbox_path(&app)?;
    let raw = match fs::read_to_string(&path) {
        Ok(raw) => raw,
        Err(error) if error.kind() == ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => return Err(format!("read activity inbox: {error}")),
    };

    // Remove first so events are processed at most once even if a later parse
    // step were to fail.
    let _ = fs::remove_file(&path);

    let mut events: Vec<serde_json::Value> = raw
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .filter_map(|line| serde_json::from_str::<serde_json::Value>(line).ok())
        .collect();

    if events.len() > ACTIVITY_INBOX_MAX_EVENTS {
        events = events.split_off(events.len() - ACTIVITY_INBOX_MAX_EVENTS);
    }

    Ok(events)
}

#[tauri::command]
fn load_pet_state(app: AppHandle) -> Result<Option<serde_json::Value>, String> {
    let path = state_file_path(&app)?;
    let raw = match fs::read_to_string(&path) {
        Ok(raw) => raw,
        Err(error) if error.kind() == ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(format!("read pet state: {error}")),
    };

    let stored = match serde_json::from_str::<StoredPetState>(&raw) {
        Ok(stored) => stored,
        Err(_) => return Ok(None),
    };

    if stored.schema_version != STATE_SCHEMA_VERSION {
        return Ok(None);
    }

    Ok(Some(stored.state))
}

#[tauri::command]
fn save_pet_state(app: AppHandle, state: serde_json::Value) -> Result<(), String> {
    let path = state_file_path(&app)?;
    let dir = path
        .parent()
        .ok_or_else(|| "resolve pet state parent directory".to_string())?;
    fs::create_dir_all(dir).map_err(|error| format!("create app data dir: {error}"))?;

    let stored = StoredPetState {
        schema_version: STATE_SCHEMA_VERSION,
        state,
    };
    let raw = serde_json::to_vec_pretty(&stored)
        .map_err(|error| format!("serialize pet state: {error}"))?;
    let tmp_path = path.with_extension("json.tmp");
    fs::write(&tmp_path, raw).map_err(|error| format!("write temporary pet state: {error}"))?;
    fs::rename(&tmp_path, &path).map_err(|error| format!("replace pet state: {error}"))?;
    Ok(())
}

fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn hide_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            load_pet_state,
            save_pet_state,
            list_external_pet_packs,
            drain_activity_inbox
        ])
        .setup(|app| {
            let show_i = MenuItem::with_id(app, "show", "Show Pixel Pet", true, None::<&str>)?;
            let hide_i = MenuItem::with_id(app, "hide", "Hide", true, None::<&str>)?;
            let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_i, &hide_i, &quit_i])?;

            let tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("Pixel Pet")
                .menu(&menu)
                .show_menu_on_left_click(true)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => show_main_window(app),
                    "hide" => hide_main_window(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_main_window(tray.app_handle());
                    }
                })
                .build(app)?;

            app.manage(tray);
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() != "main" {
                return;
            }

            if let WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running pixel-pet");
}
