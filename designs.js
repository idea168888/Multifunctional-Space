export const DESIGN_STYLES = {
  minimal: "留白極簡",
  editorial: "雜誌編輯",
  gradient: "夢幻漸層",
  collage: "拼貼手帳",
  poster: "幾何海報",
  retro: "復古印刷",
};
export const DESIGN_PALETTES = {
  green: ["#e9efdf", "#245648"],
  sand: ["#f5e7cd", "#76502e"],
  night: ["#253750", "#f5e9d3"],
  rose: ["#ffe7e3", "#733d50"],
  lilac: ["#ece8ff", "#493d79"],
  ocean: ["#dbf1f4", "#164f63"],
};
export function designBackdrop(ctx, w, h, a, image) {
  const [bg, fg] = DESIGN_PALETTES[a.palette] || DESIGN_PALETTES.green,
    accent = /^#[0-9a-f]{6}$/i.test(a.accent) ? a.accent : "#d68b56";
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  const style = a.template || "minimal";
  if (style === "gradient") {
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, bg);
    g.addColorStop(1, accent);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#ffffff55";
    ctx.beginPath();
    ctx.arc(w * 0.8, h * 0.2, w * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = a.palette === "night" ? "#253750ee" : "#ffffffcc";
    ctx.beginPath();
    ctx.roundRect(65, h * 0.2, w - 130, h * 0.66, 40);
    ctx.fill();
  }
  if (style === "editorial") {
    ctx.fillStyle = accent;
    ctx.fillRect(60, h * 0.18, 18, h * 0.66);
    ctx.strokeStyle = fg;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(110, h * 0.17);
    ctx.lineTo(w - 85, h * 0.17);
    ctx.moveTo(110, h * 0.86);
    ctx.lineTo(w - 85, h * 0.86);
    ctx.stroke();
    ctx.fillStyle = fg;
    ctx.font = "bold 30px serif";
    ctx.fillText("ISSUE / 001", w - 290, 120);
  }
  if (style === "collage") {
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(-0.035);
    ctx.fillStyle = "#00000013";
    ctx.fillRect(-w * 0.43 + 12, -h * 0.37 + 20, w * 0.86, h * 0.75);
    ctx.fillStyle = a.palette === "night" ? "#34445e" : "#fffdf5";
    ctx.fillRect(-w * 0.43, -h * 0.37, w * 0.86, h * 0.75);
    ctx.restore();
    ctx.fillStyle = accent + "99";
    ctx.fillRect(w * 0.37, h * 0.12, w * 0.26, 45);
    ctx.fillStyle = fg;
    ctx.font = "76px serif";
    ctx.fillText("✧", w - 160, h - 120);
  }
  if (style === "poster") {
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(w * 0.9, h * 0.05, w * 0.33, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = fg;
    ctx.fillRect(65, h * 0.83, w * 0.32, 18);
    ctx.save();
    ctx.translate(w * 0.91, h * 0.82);
    ctx.rotate(0.4);
    ctx.fillRect(-30, -30, 60, 60);
    ctx.restore();
  }
  if (style === "retro") {
    ctx.fillStyle = accent;
    ctx.fillRect(35, 35, w - 70, h - 70);
    ctx.fillStyle = bg;
    ctx.fillRect(55, 55, w - 110, h - 110);
    ctx.strokeStyle = fg;
    ctx.lineWidth = 4;
    ctx.strokeRect(70, 70, w - 140, h - 140);
    ctx.globalAlpha = 0.1;
    ctx.fillStyle = fg;
    for (let y = 90; y < h - 80; y += 25)
      for (let x = 90; x < w - 80; x += 25) {
        ctx.beginPath();
        ctx.arc(x, y, 1.4, 0, Math.PI * 2);
        ctx.fill();
      }
    ctx.globalAlpha = 1;
  }
  if (image) {
    const scale = Math.max(w / image.width, h / image.height);
    ctx.drawImage(
      image,
      (w - image.width * scale) / 2,
      (h - image.height * scale) / 2,
      image.width * scale,
      image.height * scale,
    );
    ctx.fillStyle = a.palette === "night" ? "#253750e8" : "#faf9f5e6";
    ctx.fillRect(65, h * 0.2, w - 130, h * 0.66);
  }
  if (style === "minimal") {
    ctx.strokeStyle = fg;
    ctx.lineWidth = 2;
    ctx.strokeRect(50, 50, w - 100, h - 100);
    ctx.fillStyle = fg;
    ctx.font = "82px sans-serif";
    ctx.fillText("✳", 100, 100);
  }
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillStyle = fg;
  ctx.font = "24px sans-serif";
  if (style !== "minimal")
    ctx.fillText(a.kicker || "CREATIVE NOTES / 靈感日誌", 100, 100);
  return { bg, fg };
}
