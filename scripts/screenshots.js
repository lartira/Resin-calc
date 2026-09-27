// Takes README screenshots of the built app with demo data.
// Usage: npm run screenshots  (builds, creates demo data, then runs this with Electron)
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const OUT = path.join(__dirname, '..', 'docs', 'screenshots');
const WIDTH = 1440;
const HEIGHT = 900;
const wait = (ms) => new Promise(r => setTimeout(r, ms));

// [file name, nav tab index, optional script to run on the page first]
// Indexes instead of titles so the script works in any UI language
const SHOW_UPDATE = `
    document.body.dataset.demoUpdate = JSON.stringify({
        state: 'available',
        version: '1.5.0',
        releaseNotes: '<ul><li>New color gallery layout</li><li>Faster PDF invoices</li><li>Bug fixes</li></ul>'
    });
    window.dispatchEvent(new Event('demo-update'));
`;
// Settings: skip the backup buttons and show the company profile and prices
const SCROLL_TO_COMPANY = `
    const input = [...document.querySelectorAll('input')].find(i => i.value === 'Nordic Resin Studio');
    const card = input?.closest('section, .bg-skin-card');
    if (card) window.scrollTo(0, card.getBoundingClientRect().top + window.scrollY - 90);
`;
const SHOTS = [
    ['calculator.png', 0],
    ['history.png', 1],
    ['materials.png', 2],
    ['colors.png', 3],
    ['settings.png', 4, SCROLL_TO_COMPANY],
    ['update.png', 0, SHOW_UPDATE]
];

// English UI
app.commandLine.appendSwitch('lang', 'en-GB');

app.whenReady().then(async () => {
    fs.mkdirSync(OUT, { recursive: true });
    const win = new BrowserWindow({
        width: WIDTH,
        height: HEIGHT,
        show: false,
        webPreferences: {
            preload: path.join(__dirname, 'screenshot-preload.js'),
            contextIsolation: true,
            sandbox: false,
            offscreen: true // renders without a visible window and keeps painting
        }
    });
    win.webContents.setFrameRate(30);

    // Latest painted frame; capturePage() on a hidden window can return an old one
    let lastFrame = null;
    win.webContents.on('paint', (_event, _dirty, image) => { lastFrame = image; });

    await win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
    await wait(2000);

    for (const [file, tab, script] of SHOTS) {
        await win.webContents.executeJavaScript(`
            document.querySelectorAll('nav button')[${tab}]?.click();
            window.scrollTo(0, 0);
        `);
        await wait(600);
        if (script) {
            await win.webContents.executeJavaScript(script);
            await wait(600);
        }
        // Let a fresh frame paint
        win.webContents.invalidate();
        await wait(800);
        fs.writeFileSync(path.join(OUT, file), lastFrame.toPNG());
        console.log('saved', file);
    }
    app.quit();
});
