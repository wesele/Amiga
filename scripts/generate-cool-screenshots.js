import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

// Helper to convert file to base64
function fileToBase64(filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  return `data:image/png;base64,${fileBuffer.toString('base64')}`;
}

const learnHubB64 = fileToBase64(path.join(rootDir, 'docs/images/real-app-learn-hub.png'));
const soulMateB64 = fileToBase64(path.join(rootDir, 'docs/images/real-app-soulmate-male.png'));
const achievementsB64 = fileToBase64(path.join(rootDir, 'docs/images/real-app-achievements.png'));
const tvModeB64 = fileToBase64(path.join(rootDir, 'docs/images/real-app-soulmate-female-tv.png'));

// HTML template for Mobile Mockup
function generateMobileMockupHtml(imgB64, title, subtitle) {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    width: 800px;
    height: 1000px;
    background: radial-gradient(circle at 50% 30%, #1e1b4b 0%, #0f172a 60%, #020617 100%);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #f8fafc;
    overflow: hidden;
  }
  .header {
    text-align: center;
    margin-bottom: 30px;
  }
  .badge {
    display: inline-block;
    padding: 6px 16px;
    background: rgba(99, 102, 241, 0.2);
    border: 1px solid rgba(129, 140, 248, 0.4);
    border-radius: 20px;
    font-size: 14px;
    font-weight: 600;
    color: #818cf8;
    letter-spacing: 1px;
    text-transform: uppercase;
    margin-bottom: 12px;
  }
  .title {
    font-size: 32px;
    font-weight: 800;
    background: linear-gradient(135deg, #ffffff 0%, #cbd5e1 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }
  .phone-container {
    position: relative;
    width: 420px;
    height: 780px;
    background: #090d16;
    border-radius: 48px;
    padding: 14px;
    box-shadow: 
      0 25px 50px -12px rgba(0, 0, 0, 0.7),
      0 0 80px rgba(99, 102, 241, 0.25),
      inset 0 0 0 2px rgba(255, 255, 255, 0.15);
  }
  .phone-screen {
    width: 100%;
    height: 100%;
    border-radius: 36px;
    overflow: hidden;
    position: relative;
    background: #ffffff;
  }
  .phone-screen img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .camera-notch {
    position: absolute;
    top: 22px;
    left: 50%;
    transform: translateX(-50%);
    width: 110px;
    height: 24px;
    background: #000;
    border-radius: 12px;
    z-index: 10;
  }
</style>
</head>
<body>
  <div class="header">
    <div class="badge">${title}</div>
    <div class="title">${subtitle}</div>
  </div>
  <div class="phone-container">
    <div class="camera-notch"></div>
    <div class="phone-screen">
      <img src="${imgB64}" />
    </div>
  </div>
</body>
</html>`;
}

// HTML template for TV Widescreen Mockup
function generateTvMockupHtml(imgB64, title, subtitle) {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    width: 1280px;
    height: 800px;
    background: radial-gradient(circle at 50% 40%, #1e293b 0%, #0f172a 60%, #020617 100%);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #f8fafc;
    overflow: hidden;
  }
  .header {
    text-align: center;
    margin-bottom: 24px;
  }
  .badge {
    display: inline-block;
    padding: 6px 16px;
    background: rgba(34, 197, 94, 0.2);
    border: 1px solid rgba(74, 222, 128, 0.4);
    border-radius: 20px;
    font-size: 14px;
    font-weight: 600;
    color: #4ade80;
    letter-spacing: 1px;
    text-transform: uppercase;
    margin-bottom: 8px;
  }
  .title {
    font-size: 32px;
    font-weight: 800;
    background: linear-gradient(135deg, #ffffff 0%, #cbd5e1 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }
  .tv-frame {
    position: relative;
    width: 1040px;
    height: 590px;
    background: #0f172a;
    border-radius: 20px;
    padding: 12px;
    box-shadow: 
      0 30px 60px -15px rgba(0, 0, 0, 0.8),
      0 0 100px rgba(34, 197, 94, 0.2),
      inset 0 0 0 2px rgba(255, 255, 255, 0.1);
  }
  .tv-screen {
    width: 100%;
    height: 100%;
    border-radius: 12px;
    overflow: hidden;
    background: #000;
  }
  .tv-screen img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
</style>
</head>
<body>
  <div class="header">
    <div class="badge">${title}</div>
    <div class="title">${subtitle}</div>
  </div>
  <div class="tv-frame">
    <div class="tv-screen">
      <img src="${imgB64}" />
    </div>
  </div>
</body>
</html>`;
}

// Generate temp HTML files and render via msedge headless
const targets = [
  {
    name: 'cool-app-learn-hub.png',
    width: 800,
    height: 1000,
    html: generateMobileMockupHtml(learnHubB64, 'MOBILE & DESKTOP', '学习中心与智能晋级之路')
  },
  {
    name: 'cool-app-soulmate.png',
    width: 800,
    height: 1000,
    html: generateMobileMockupHtml(soulMateB64, 'AI COMPANION', '每天，都有一封为你而来的信')
  },
  {
    name: 'cool-app-achievements.png',
    width: 800,
    height: 1000,
    html: generateMobileMockupHtml(achievementsB64, 'GAMIFICATION', '成就积累与打卡矩阵')
  },
  {
    name: 'cool-app-tv-mode.png',
    width: 1280,
    height: 800,
    html: generateTvMockupHtml(tvModeB64, 'ANDROID TV 10-FOOT UI', '把故事与陪伴带到客厅大屏')
  }
];

const tempDir = path.join(rootDir, 'scripts/temp_mockups');
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

for (const t of targets) {
  const htmlPath = path.join(tempDir, `${t.name}.html`);
  const outPath = path.join(rootDir, `docs/images/${t.name}`);
  fs.writeFileSync(htmlPath, t.html, 'utf8');

  console.log(`Generating cool mockup for ${t.name}...`);
  const cmd = `powershell.exe -ExecutionPolicy Bypass -Command "& 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' --headless=new --disable-gpu --window-size=${t.width},${t.height} --screenshot=\\"${outPath}\\" \\"${htmlPath}\\""`;
  execSync(cmd);
  console.log(`Saved: ${outPath}`);
}

console.log('All cool mockups generated successfully!');
