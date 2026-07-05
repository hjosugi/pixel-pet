import type { PetMode, PetState } from "./state";
import { DEFAULT_PET_PACK_ID, getPetPack, type PetPack } from "./packs";

export type BallGameView = {
  active: boolean;
  x: number;
  y: number;
  radius: number;
  score: number;
};

export class PixelPetRenderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly fallbackScale = 4;
  private spriteSheet = new Image();
  private spriteReady = false;
  private currentSpriteId = "";

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas is not available.");
    this.ctx = ctx;
    this.ctx.imageSmoothingEnabled = false;
  }

  draw(pet: PetState, now: number, ball?: BallGameView) {
    const ctx = this.ctx;
    const lowDistraction = pet.settings.lowDistractionMode;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    this.drawGrid(now, lowDistraction);
    if (ball?.active) this.drawBall(ball, now);

    const t = now / 1000;
    const bob = pet.mode === "sleep" ? 0 : Math.round(Math.sin(t * (lowDistraction ? 3 : 5)) * (lowDistraction ? 0.7 : 1.5));
    const glitch = !lowDistraction && pet.mode === "react" && Math.floor(t * 18) % 2 === 0;
    const pack = this.resolvePack(pet.id);
    const scale = pack?.scale ?? this.fallbackScale;
    const x = Math.round(pet.x / scale);
    const y = Math.round((pet.y + bob) / scale);

    this.withPixelScale(scale, () => {
      this.drawNeonShadow(x, y, glitch);
      if (this.drawSpritePet(x, y, pet, now, pack)) {
        // Sprite rendered from the pet pack.
      } else {
        this.drawCat(x, y, pet, glitch, now);
      }
      if (pet.mode === "sleep") this.drawSleepSignal(x, y, now);
      if (pet.mode === "walk") this.drawWalkDust(x, y, now);
    });
  }

  private resolvePack(petId: string) {
    return getPetPack(petId) ?? getPetPack(DEFAULT_PET_PACK_ID) ?? null;
  }

  private ensureSpriteLoaded(pack: PetPack | null) {
    if (!pack || this.currentSpriteId === pack.id) return;

    this.currentSpriteId = pack.id;
    this.spriteReady = false;
    this.spriteSheet = new Image();
    this.spriteSheet.onload = () => {
      this.spriteReady = true;
      this.ctx.imageSmoothingEnabled = false;
    };
    this.spriteSheet.onerror = () => {
      this.spriteReady = false;
    };
    this.spriteSheet.src = pack.spriteUrl;
  }

  private drawSpritePet(x: number, y: number, pet: PetState, now: number, pack: PetPack | null) {
    this.ensureSpriteLoaded(pack);
    if (!pack || !this.spriteReady) return false;

    const spec = pack.animations[pet.mode];
    const frameSize = pack.frameSize;
    const elapsed = Math.max(0, Date.now() - pet.modeStartedAt) / 1000;
    const rawFrame = Math.floor(elapsed * spec.fps);
    const frameIndex = spec.loop ? rawFrame % spec.frames.length : Math.min(rawFrame, spec.frames.length - 1);
    const frame = spec.frames[frameIndex];
    const sx = frame * frameSize;
    const sy = spec.row * frameSize;

    this.ctx.save();
    this.ctx.imageSmoothingEnabled = false;
    if (pet.mode === "walk" && pet.vx < 0) {
      this.ctx.translate(x + frameSize, y);
      this.ctx.scale(-1, 1);
      this.ctx.drawImage(this.spriteSheet, sx, sy, frameSize, frameSize, 0, 0, frameSize, frameSize);
    } else {
      this.ctx.drawImage(this.spriteSheet, sx, sy, frameSize, frameSize, x, y, frameSize, frameSize);
    }
    this.ctx.restore();

    if (!pet.settings.lowDistractionMode && pet.mode === "react" && Math.floor(now / 70) % 2 === 0) {
      this.ctx.globalAlpha = 0.38;
      this.px(x + 1, y + 6, 28, 2, "#ff55f7");
      this.px(x + 5, y + 18, 25, 1, "#5cffea");
      this.ctx.globalAlpha = 1;
    }

    return true;
  }

  private withPixelScale(scale: number, draw: () => void) {
    this.ctx.save();
    this.ctx.scale(scale, scale);
    draw();
    this.ctx.restore();
  }

  private px(x: number, y: number, w: number, h: number, color: string) {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(x, y, w, h);
  }

  private drawGrid(now: number, lowDistraction: boolean) {
    const ctx = this.ctx;
    const phase = Math.floor(now / 80) % 18;
    ctx.save();
    ctx.globalAlpha = lowDistraction ? 0.05 : 0.12;
    ctx.strokeStyle = "#48ffe8";
    ctx.lineWidth = 1;
    for (let x = -phase; x < this.canvas.width; x += 18) {
      ctx.beginPath();
      ctx.moveTo(x, 152);
      ctx.lineTo(x + 80, this.canvas.height);
      ctx.stroke();
    }
    ctx.globalAlpha = lowDistraction ? 0.035 : 0.08;
    for (let y = 154; y < this.canvas.height; y += 14) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(this.canvas.width, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawNeonShadow(x: number, y: number, glitch: boolean) {
    this.ctx.globalAlpha = 0.42;
    this.px(x - 5, y + 27, 35, 3, glitch ? "#ff4df8" : "#28ffe8");
    this.ctx.globalAlpha = 1;
  }

  private drawBall(ball: BallGameView, now: number) {
    const pulse = Math.floor(now / 140) % 2;
    const x = Math.round(ball.x);
    const y = Math.round(ball.y);
    const r = ball.radius;

    this.ctx.save();
    this.ctx.globalAlpha = 0.88;
    this.ctx.fillStyle = "#070a14";
    this.ctx.fillRect(x - r - 1, y - r - 1, r * 2 + 2, r * 2 + 2);
    this.ctx.fillStyle = pulse ? "#ff55f7" : "#5cffea";
    this.ctx.fillRect(x - r, y - r, r * 2, r * 2);
    this.ctx.fillStyle = "#fff3a3";
    this.ctx.fillRect(x - 2, y - r + 1, 4, 2);
    this.ctx.fillStyle = "rgba(92, 255, 234, 0.28)";
    this.ctx.fillRect(x - r - 3, y + r + 2, r * 2 + 6, 2);
    this.ctx.restore();
  }

  private drawCat(x: number, y: number, pet: PetState, glitch: boolean, now: number) {
    const body = "#26293f";
    const body2 = "#34385a";
    const line = "#070a14";
    const cyan = "#5cffea";
    const magenta = "#ff55f7";
    const eye = pet.mode === "sleep" ? "#8afff0" : "#eaffff";
    const blink = pet.mode !== "sleep" && Math.floor(now / 2400) % 7 === 0;
    const tailUp = Math.floor(now / 400) % 2 === 0;

    if (glitch) {
      this.px(x - 3, y + 6, 24, 15, magenta);
      this.px(x + 5, y + 1, 23, 17, cyan);
    }

    // Tail
    this.px(x + 25, y + 14, 3, 10, line);
    this.px(x + 27, y + 10, 4, tailUp ? 7 : 12, line);
    this.px(x + 26, y + 13, 3, 9, body2);
    this.px(x + 28, y + 10, 3, tailUp ? 6 : 10, body2);
    this.px(x + 28, y + 9, 3, 3, cyan);

    // Body
    this.px(x + 4, y + 12, 21, 15, line);
    this.px(x + 6, y + 13, 18, 13, body);
    this.px(x + 9, y + 15, 12, 9, body2);
    this.px(x + 11, y + 24, 3, 4, line);
    this.px(x + 19, y + 24, 3, 4, line);

    // Head
    this.px(x + 7, y + 3, 19, 16, line);
    this.px(x + 9, y + 5, 15, 13, body2);

    // Ears
    this.px(x + 8, y + 0, 5, 6, line);
    this.px(x + 20, y + 0, 5, 6, line);
    this.px(x + 10, y + 2, 3, 4, body2);
    this.px(x + 20, y + 2, 3, 4, body2);
    this.px(x + 10, y + 3, 1, 2, magenta);
    this.px(x + 22, y + 3, 1, 2, cyan);

    // Face
    if (blink) {
      this.px(x + 12, y + 11, 3, 1, eye);
      this.px(x + 19, y + 11, 3, 1, eye);
    } else if (pet.mode === "sleep") {
      this.px(x + 12, y + 11, 4, 1, eye);
      this.px(x + 19, y + 11, 4, 1, eye);
    } else {
      this.px(x + 12, y + 9, 3, 4, eye);
      this.px(x + 19, y + 9, 3, 4, eye);
      this.px(x + 13, y + 9, 1, 2, cyan);
      this.px(x + 20, y + 9, 1, 2, magenta);
    }
    this.px(x + 16, y + 14, 2, 1, "#ffc7f7");
    this.px(x + 15, y + 16, 1, 1, cyan);
    this.px(x + 18, y + 16, 1, 1, cyan);

    // Cyber collar
    this.px(x + 10, y + 18, 13, 2, line);
    this.px(x + 12, y + 18, 3, 2, cyan);
    this.px(x + 18, y + 18, 3, 2, magenta);
  }

  private drawSleepSignal(x: number, y: number, now: number) {
    const step = Math.floor(now / 500) % 3;
    this.ctx.globalAlpha = 0.8;
    for (let i = 0; i <= step; i += 1) {
      this.px(x + 30 + i * 4, y + 2 - i * 4, 2 + i, 1 + i, "#5cffea");
    }
    this.ctx.globalAlpha = 1;
  }

  private drawWalkDust(x: number, y: number, now: number) {
    const phase = Math.floor(now / 160) % 3;
    this.ctx.globalAlpha = 0.45;
    this.px(x + 2 - phase, y + 28, 2, 1, "#ff55f7");
    this.px(x + 6 - phase * 2, y + 30, 2, 1, "#5cffea");
    this.ctx.globalAlpha = 1;
  }
}
