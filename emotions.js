// Local deterministic phrase matching and canvas puppetry; no generative image service.
export const INTENTS = {
  neutral: {
    label: "自然待命",
    expression: "happy",
    motion: "sway",
    symbol: "",
  },
  thanks: {
    label: "感謝鞠躬",
    expression: "happy",
    motion: "bow",
    symbol: "✧",
  },
  sorry: { label: "歉意鞠躬", expression: "sad", motion: "bow", symbol: "…" },
  cheer: {
    label: "打氣跳躍",
    expression: "happy",
    motion: "jump",
    symbol: "★",
  },
  sleep: {
    label: "晚安休息",
    expression: "sleep",
    motion: "sleep",
    symbol: "Zzz",
  },
  laugh: {
    label: "開心大笑",
    expression: "laugh",
    motion: "laugh",
    symbol: "✧",
  },
  love: {
    label: "喜歡比心",
    expression: "happy",
    motion: "love",
    symbol: "♥",
  },
  sad: { label: "難過落淚", expression: "sad", motion: "sad", symbol: "涙" },
  angry: {
    label: "生氣跺腳",
    expression: "angry",
    motion: "angry",
    symbol: "!",
  },
  surprise: {
    label: "驚訝後仰",
    expression: "surprise",
    motion: "surprise",
    symbol: "?!",
  },
  greeting: {
    label: "招呼搖擺",
    expression: "happy",
    motion: "wave",
    symbol: "✦",
  },
  tired: {
    label: "疲倦趴軟",
    expression: "sleep",
    motion: "tired",
    symbol: "…",
  },
  confused: {
    label: "疑惑歪頭",
    expression: "surprise",
    motion: "confused",
    symbol: "?",
  },
};
export function inferIntent(text) {
  const s = text.normalize("NFKC").toLowerCase().replace(/\s+/g, "");
  const rules = [
    ["cheer", /不要(?:哭|難過|放棄)|別(?:哭|難過)|不哭|打起精神/],
    ["neutral", /不生氣|別生氣|不要生氣|沒生氣|不難過|不開心才怪/],
    ["sorry", /對不起|抱歉|不好意思|sorry|apolog/],
    ["thanks", /謝謝|感謝|感恩|多謝|thank/],
    ["sleep", /晚安|好夢|睡覺|先睡|想睡|再五分鐘|goodnight|sleep/],
    ["tired", /辛苦|累|疲倦|躺平|休息|沒電|放假|下班|tired/],
    ["angry", /生氣|氣死|可惡|憤怒|怒|angry/],
    ["sad", /難過|傷心|哭|委屈|崩潰|心碎|sad|cry/],
    ["love", /喜歡|愛你|想你|比心|抱抱|love|missyou/],
    ["laugh", /哈哈|笑|開心|好耶|恭喜|慶祝|快樂|高興|happy|lol|haha/],
    ["cheer", /加油|努力|衝|出發|讚|發射|啟動|go!|fighting/],
    ["surprise", /驚|嚇|哇|蛤|救命|omg|wow/],
    ["confused", /為什麼|什麼|怎麼|疑惑|不懂|讓我想|想想|why|what|\?/],
    ["greeting", /你好|早安|嗨|哈囉|再見|掰掰|hello|bye|hi$/],
  ];
  return rules.find(([, pattern]) => pattern.test(s))?.[0] || "neutral";
}
export function resolveIntent(text, override = "auto") {
  return Object.hasOwn(INTENTS, override) ? override : inferIntent(text);
}
export function poseFor(motion, phase) {
  const t = phase * Math.PI * 2,
    s = Math.sin(t),
    b = (1 - Math.cos(t)) / 2;
  let x = 0,
    y = 0,
    angle = 0,
    sx = 0.88,
    sy = 0.88;
  switch (motion) {
    case "bow":
      sy -= b * 0.2;
      angle = b * 0.12;
      y = b * 15;
      break;
    case "jump":
    case "bounce":
      y = -b * 16;
      sx += s * 0.03;
      sy -= s * 0.03;
      break;
    case "sleep":
      angle = 0.12 + b * 0.05;
      sy -= b * 0.04;
      y = 8;
      break;
    case "laugh":
      x = Math.sin(t * 2) * 4;
      sy -= b * 0.09;
      angle = s * 0.035;
      break;
    case "love":
    case "pulse":
      sx += b * 0.07;
      sy += b * 0.07;
      break;
    case "sad":
      angle = -0.08 + s * 0.02;
      y = b * 6;
      break;
    case "angry":
      x = Math.sin(t * 3) * 5;
      y = -Math.abs(Math.sin(t * 2)) * 5;
      break;
    case "surprise":
      angle = -b * 0.13;
      sx -= b * 0.04;
      sy += b * 0.05;
      y = -b * 9;
      break;
    case "wave":
    case "shake":
      angle = s * 0.09;
      x = s * 4;
      break;
    case "tired":
      sy -= 0.2 + b * 0.04;
      sx += 0.07;
      y = 19;
      angle = -0.06;
      break;
    case "confused":
      angle = 0.13 + s * 0.05;
      break;
    case "wobble":
      angle = s * 0.12;
      sx += s * 0.03;
      break;
    default:
      angle = s * 0.025;
      y = s * 3;
  }
  return { x, y, angle, sx, sy };
}
export function drawFace(ctx, expression, cx, cy, width, height) {
  ctx.save();
  ctx.strokeStyle = "#263b35";
  ctx.fillStyle = "#263b35";
  ctx.lineWidth = Math.max(1.6, width * 0.035);
  ctx.lineCap = "round";
  const eyes = [cx - width * 0.23, cx + width * 0.23],
    ey = cy - height * 0.2;
  for (const ex of eyes) {
    ctx.beginPath();
    if (["sleep", "sad"].includes(expression)) {
      ctx.moveTo(ex - width * 0.08, ey);
      ctx.lineTo(
        ex + width * 0.08,
        ey + (expression === "sad" ? height * 0.06 : 0),
      );
      ctx.stroke();
    } else if (expression === "laugh") {
      ctx.arc(ex, ey + height * 0.02, width * 0.07, Math.PI, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.ellipse(
        ex,
        ey,
        width * 0.045,
        height * (expression === "surprise" ? 0.16 : 0.095),
        0,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
  }
  if (expression === "angry") {
    ctx.beginPath();
    ctx.moveTo(eyes[0] - width * 0.09, ey - height * 0.23);
    ctx.lineTo(eyes[0] + width * 0.08, ey - height * 0.12);
    ctx.moveTo(eyes[1] - width * 0.08, ey - height * 0.12);
    ctx.lineTo(eyes[1] + width * 0.09, ey - height * 0.23);
    ctx.stroke();
  }
  ctx.beginPath();
  const my = cy + height * 0.25;
  if (expression === "surprise")
    ctx.ellipse(cx, my, width * 0.07, height * 0.14, 0, 0, Math.PI * 2);
  else if (["sad", "angry"].includes(expression))
    ctx.arc(cx, my + height * 0.16, width * 0.12, Math.PI, 2 * Math.PI);
  else if (expression === "sleep") {
    ctx.moveTo(cx - width * 0.08, my);
    ctx.lineTo(cx + width * 0.08, my);
  } else ctx.arc(cx, my - height * 0.04, width * 0.13, 0, Math.PI);
  ctx.stroke();
  ctx.restore();
}
export function drawEmotion(ctx, intent, phase = 0) {
  const t = phase * Math.PI * 2,
    b = (1 - Math.cos(t)) / 2;
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "bold 28px sans-serif";
  if (intent === "love") {
    ctx.fillStyle = "#d84d72";
    ctx.fillText("♥", 78, 143 - b * 12);
    ctx.font = "22px sans-serif";
    ctx.fillText("♥", 290, 192 - b * 16);
  } else if (intent === "sleep") {
    ctx.fillStyle = "#596d9e";
    ctx.fillText("Z", 276, 130 - b * 8);
    ctx.font = "18px sans-serif";
    ctx.fillText("z", 302, 105 - b * 8);
  } else if (intent === "sad") {
    ctx.fillStyle = "#5ca4d9";
    for (const x of [107, 263]) {
      const y = 188 + b * 25;
      ctx.beginPath();
      ctx.moveTo(x, y - 8);
      ctx.quadraticCurveTo(x - 10, y + 8, x, y + 12);
      ctx.quadraticCurveTo(x + 10, y + 8, x, y - 8);
      ctx.fill();
    }
  } else if (intent === "angry") {
    ctx.strokeStyle = "#dc6258";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(278, 112);
    ctx.lineTo(298, 132);
    ctx.moveTo(298, 112);
    ctx.lineTo(278, 132);
    ctx.stroke();
  } else {
    const symbol = INTENTS[intent]?.symbol;
    if (symbol) {
      ctx.fillStyle = ["surprise", "confused"].includes(intent)
        ? "#9d6b30"
        : "#bc873e";
      ctx.fillText(symbol, 288, 125 - b * 8);
    }
  }
  ctx.restore();
}
