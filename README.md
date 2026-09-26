# ⚗️ Epoxy Calculator
![Version](https://img.shields.io/badge/version-1.4.81-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)

A desktop application for calculating epoxy casting costs, managing materials, and tracking project history. Built with Electron and React.

## 🌟 Features

- **🧮 Cost Calculator**: Calculate prices based on material usage, labor, mold wear, consumables, and more.
- **📜 Project History**: Save calculations, merge invoices, and view summarized project stats.
- **📄 PDF Export**: Generate professional PDF invoices (single or merged) with auto-numbering.
- **👥 Customer Directory**: Manage customer details and easily add them to invoices.
- **🧪 Material Management**: Full customization of Materials and **Material Categories**. Organize specific resins, molds, and items.
- **🎨 Color Library**: Save and organize your color pigments with pricing. Supports **Custom Color Categories** (e.g., Micas, Pastes, Inks).
- **⚙️ Settings**: Customize hourly rates, currency, themes, company info, and global defaults.
- **🎨 Themes**: Choose from Light, Dark, Ocean, and Sunset themes.
- **🧾Invoice Merging**: Select multiple projects to create a single merged invoice.
- **🧾Invoice Numbering**: Automatic year-based numbering (YYYY-NNN).
- **🔒 Privacy & Control**: Data is stored in files you own. No external cloud servers or subscriptions required.
- **💾 Backup & Restore**: Export/Import your full database including images, Customer Directory, Material Management, Color Library, Settings, and much more.
- **☁️ Shared Database**: Configurable storage path for syncing data across computers via shared folders.
- **👥 Customer Directory**: Dedicated directory in Settings to manage customer details.
- **🖥️ Full Screen Support**: Optimized layout for large monitors with responsive grids.

## 📥 Installation

This application is provided as source code. You will need Node.js installed to run it.

1.  **Install Node.js**: Ensure you have Node.js (version 18+) installed.
    *   Download: [https://nodejs.org/](https://nodejs.org/)
2.  **Clone/Download** this repository.
3.  **Open a terminal** in the project directory (`epoxy-calculator`).
4.  **Install dependencies**:
    ```bash
    npm install
    ```

## 🚀 Usage

### 💻 Development Mode
To start the application in development mode (with hot-reload):

```bash
npm run dev
```

This will launch two processes:
1.  Vite server (for React frontend)
2.  Electron window

### 📦 Build for Production
To package the application as an executable (exe/dmg/etc.):

```bash
npm run dist
```

The output file will be located in the `dist-electron/` directory.

## 🛠️ Technologies

- **Electron**: Desktop runtime
- **React**: UI Framework
- **Vite**: Build tool and dev server
- **TailwindCSS**: Styling
- **Lucide React**: Icons
- **✨ Vibe-code**: Coded with Vibe-code

## 🆕 Latest Updates (v1.4.81)

- **� Network Stability**: Complete overhaul of the saving engine. Now robust against Windows Network Drive errors.
- **📂 Categories**: You can now create/rename/delete custom categories for both Materials and Colors.
- **🛡️ Close Protection**: "Close Confirmation" dialog ensures you never accidentally close without saving.
- **⚡ Performance**: Optimized rendering and saving for smoother experience with large databases.
- **🧹 Auto-Cleanup**: Smart detection of database path issues on startup.
- **� Fixes**: Fixed PDF Header alignment, duplicate entries, and "Data Corruption" false alarms.
- **🐛 Bug Fixes**: Improved Drift calculation logic and fixed PDF header alignment.
- **🛑 Force Sync**: Added "Force Sync" button to ensure data is saved to the database file.
- **⚡ Force Sync**: New "Force Sync" button in Settings to manually push data to the network drive immediately.
- **🛡️ Data Integrity**: Enhanced protection against network drive failures (0-byte files) with atomic write locking and robust backup restoration.
- **🌍 Translations**: Improved multilingual support for new features (DA, EN, DE, NO, SV, PL).
- **🎨 UI Polish**: Better styling for sync controls and consistent theming.
- **🐛 Fixes**: Resolves issues with "stale data" after updates and prevents save conflicts.
## 📄 License

This project is open source.

<br />

> [!TIP]
> **Too tech-savvy?**
> Or if you don't bother with all the codeing, here's an setup.exe file: [Download Release](https://github.com/lartira/Resin-calc/releases/latest)

## � To-Do

- [✅] **Smart Auto-save**: Implemented local buffering system.
- [✅] **Network Stability**: Added Retry, Copy-Fallback, and Emergency Rescue.
- [✅] **Sync Settings**: Added configurable sync interval.
- [✅] **UI Feedback**: Added "Saving..." indicators and Error Dialogs.
- [✅] **Differential Updates**: Implemented safe merging of data.
- [✅] **Custom Categories**: Added full management for Material/Color categories.
- [ ] **Update Checker**: Automated GitHub Release checking (In Progress).