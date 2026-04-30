# ❯ superssh

**A high-performance, interactive SSH connection manager for the modern terminal.**

[Features](#-features) • [Quick Start](#-quick-start) • [Usage](#-usage) • [Tech Stack](#-tech-stack)

---

`superssh` transforms your flat `~/.ssh/config` file into a beautiful, interactive TUI. It allows you to navigate your hosts with arrow keys and—most importantly—gives you a **real-time "Hover-Preview"** of a server's health before you even connect.

## ✨ Features

- 🚀 **Lightning Fast**: Built with **Bun** and **TypeScript** for near-instant startup.
- 🔍 **Live Metadata (The "Magic" Feature)**: As you scroll through your hosts, `superssh` runs background, non-interactive SSH checks to fetch **Load Average** and **Disk Usage**.
- 🛡️ **Safe & Non-Blocking**: Background checks use `BatchMode` (no password prompts) and a strict 1-second timeout with debouncing to keep the UI fluid.
- 🎨 **Modern UI**: A clean, "Nord" inspired interface built with **@clack/prompts** and **picocolors**.
- ⚙️ **Smart Parsing**: Automatically reads `~/.ssh/config`, ignores wildcards, and extracts aliases (`User`/`Port`/`HostName`) as descriptions.
- 🔌 **Full TTY Handover**: Once you select a host, the tool hands over the terminal completely to the native `ssh` binary, supporting 2FA, password prompts, and your local SSH agent.

## 🚀 Quick Start

**Prerequisites:**

- [Bun](https://bun.sh) installed.
- An existing `~/.ssh/config` file.

**Installation:**

```bash
# Clone the repository
git clone https://github.com/your-username/superssh.git
cd superssh

# Install dependencies
bun install
```

## ⌨️ Usage

Run the tool with:

```bash
bun start
```

### Keybindings

- `↑ / ↓` : Navigate through hosts
- `Enter` : Connect to the highlighted host
- `q` or `Ctrl+C` : Quit the manager

## 🛠 Tech Stack

- **Runtime**: [Bun](https://bun.sh)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **UI/UX**: [@clack/prompts](https://www.clack.so/) & [prompts](https://github.com/terkelg/prompts)
- **Styling**: [picocolors](https://github.com/alexeyraspopov/picocolors)
