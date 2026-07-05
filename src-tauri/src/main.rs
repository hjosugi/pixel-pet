#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{fs, io::ErrorKind, path::PathBuf};

use serde::{Deserialize, Serialize};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, WindowEvent,
};

const STATE_SCHEMA_VERSION: u32 = 1;
const STATE_FILE_NAME: &str = "pet-state.v1.json";

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
        let _ = window.set_always_on_top(true);
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
        .invoke_handler(tauri::generate_handler![load_pet_state, save_pet_state])
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
