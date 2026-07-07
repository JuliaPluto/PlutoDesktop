# Pluto Desktop _(beta release)_
[![Release](https://github.com/JuliaPluto/PlutoDesktop/actions/workflows/release.yml/badge.svg)](https://github.com/JuliaPluto/PlutoDesktop/actions/workflows/release.yml)

PlutoDesktop is a batteries-included Windows desktop application to run [Pluto](https://plutojl.org). PlutoDesktop is the easiest way to install and use Pluto on windows. 

<img width="1920" height="1200" alt="Screenshot of the Pluto Desktop landing page, showing the Pluto main menu in a Windows app" src="https://github.com/user-attachments/assets/ef2a4c68-e307-4f52-bad4-bdebb1775e80" />


## Features
The advantages compared to installing Pluto as a Julia package are:
- All-in-one: Julia and Pluto are **included in the app**
  - You don't need to install and update Pluto
  - In fact, you don't need a terminal!
- File picker: when you open or save a notebook, you can use the **native Explorer window** instead of typing a `C:\...` path.
  - You can also associate Pluto with the `.jl` or `.plutojl` file types, so you can **double click to open** notebooks.
- Auto updating: the PlutoDesktop app checks for updates in the background. So you get the latest Julia and Pluto versions automatically.
- Each window is one notebook. If you close a notebook, it shuts down.
  
## Who is this for?

Although everybody is welcome to use this, it is generally focussed on people who are not comfortable using the terminal. Students and teachers who are just interested in using Pluto.jl and want an easy installation, this is what you are looking for!

On all platforms (Windows, MacOS, Linux), you can still install Pluto as a package from the Julia package manager. PlutoDesktop is an extra option for Windows users.

<img width="1920" height="1200" alt="image" src="https://github.com/user-attachments/assets/3a7b10da-0129-4c77-bb3a-caa9b7ebdfd6" />


## Supported Platforms

Windows 64 bit only. This is because most of our users use Windows, and this is the platform where using a terminal and typing file paths is the least comon.

## Installation
You can already try an beta preview of Pluto Desktop!

**[⬇ Download Pluto for Windows](https://github.com/JuliaPluto/PlutoDesktop/releases/latest/download/PlutoSetup.exe)**

Run the installer, this will take some minutes, and Pluto is installed! You don't need to install anything else. The app keeps itself up to date automatically.

> [!WARNING]
> You will see a warning **Windows protected your PC**. Click on **More info**, and then **Run anyways**. You get this warning because we don't yet have a Windows code signing key.


<details>
  <summary>Screenshots of "Windows protected your PC"</summary>

<img width="1920" height="1200" alt="Windows protected your PC dialog: click More info" src="https://github.com/user-attachments/assets/cd81795f-2b77-4edf-8710-1bbb12edfff9" />


<img width="1920" height="1200" alt="Windows protected your PC dialog: click Run anaway" src="https://github.com/user-attachments/assets/b2370966-171e-4728-a77b-33fa9f373b37" />

  
</details>



## Uninstalling

Pluto Desktop installs per-user (no admin rights required), so removing it is quick:

1. Open **Settings → Apps → Installed apps** (or **Control Panel → Programs and Features** on older Windows).
2. Find **Pluto.jl Desktop** in the list and choose **Uninstall**.

This removes the app together with the bundled Julia and Pluto — nothing else is required.

Uninstalling does **not** delete files created while using the app. If you also want a clean slate, you can manually delete:

- `%APPDATA%\Pluto.jl Desktop` — app logs and unsaved notebooks.
- `%USERPROFILE%\.julia` — the Julia package depot, where Pluto installs the packages your notebooks use. ⚠️ Only delete this if you don't otherwise use Julia on your machine, as it is shared with any regular Julia installation.

Notebooks you saved yourself (`.jl` files) live wherever you saved them and are never touched by uninstalling.

## Maintenance

See the [maintenance guide](MAINTENANCE.md) for the versioning scheme and how to update the bundled Pluto and Julia versions.
