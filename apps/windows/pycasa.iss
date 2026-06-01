; ============================================================
;  Pycasa Windows Installer — Inno Setup Script
;  Builds: PycasaSetup-{version}.exe
;  Pass version via: ISCC /DMyAppVersion=v1.2.3 pycasa.iss
; ============================================================

#define AppName      "Pycasa"
#define AppPublisher "Pycasa"
#define AppURL       "https://github.com/Pycasa/Pycasa"
#define AppExeName   "Pycasa.exe"
#define AppIcon      "favicon.ico"

; AppVersion: prefer the /DMyAppVersion override from ISCC CLI, else read from exe
#ifndef MyAppVersion
  #define MyAppVersion GetVersionNumbersString("Pycasa.exe")
#endif

[Setup]
; Basic identity
AppId={{8F3A2B1C-4D5E-6F7A-8B9C-0D1E2F3A4B5C}
AppName={#AppName}
AppVersion={#MyAppVersion}
AppVerName={#AppName} {#MyAppVersion}
AppPublisher={#AppPublisher}
AppPublisherURL={#AppURL}
AppSupportURL={#AppURL}/issues
AppUpdatesURL={#AppURL}/releases

; Installation paths
DefaultDirName={autopf}\{#AppName}
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes

; Installer output — filename includes version e.g. PycasaSetup-v1.2.3.exe
OutputDir=dist
OutputBaseFilename=PycasaSetup-{#MyAppVersion}
SetupIconFile={#AppIcon}
UninstallDisplayIcon={app}\{#AppExeName}
UninstallDisplayName={#AppName}

; Branding images (generated from favicon.ico at build time)
WizardImageFile=installer_banner.bmp
WizardSmallImageFile=installer_small.bmp

; Compression
Compression=lzma2/ultra64
SolidCompression=yes
LZMAUseSeparateProcess=yes

; UI
WizardStyle=modern
WizardSizePercent=120
DisableWelcomePage=no
DisableReadyPage=no

; Require admin for Program Files install
PrivilegesRequired=admin
PrivilegesRequiredOverridesAllowed=dialog

; Versioning / upgrade behaviour
AllowNoIcons=yes
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible

; Don't leave a window open after install
CloseApplications=yes
RestartApplications=no

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon";   Description: "Create a &Desktop shortcut";   GroupDescription: "Additional shortcuts:"
Name: "startmenuicon"; Description: "Create a &Start Menu shortcut"; GroupDescription: "Additional shortcuts:"

[Files]
Source: "Pycasa.exe";       DestDir: "{app}"; DestName: "{#AppExeName}"; Flags: ignoreversion
Source: "favicon.ico";      DestDir: "{app}"; Flags: ignoreversion
; Bundled server JAR — always present in CI builds; skipifsourcedoesntexist for local dev
Source: "*runner.jar";      DestDir: "{app}"; Flags: ignoreversion skipifsourcedoesntexist

[Icons]
; Start Menu
Name: "{group}\{#AppName}";           Filename: "{app}\{#AppExeName}"; IconFilename: "{app}\favicon.ico"; Tasks: startmenuicon
Name: "{group}\Uninstall {#AppName}"; Filename: "{uninstallexe}";                                         Tasks: startmenuicon
; Desktop
Name: "{autodesktop}\{#AppName}";     Filename: "{app}\{#AppExeName}"; IconFilename: "{app}\favicon.ico"; Tasks: desktopicon

[Run]
Filename: "{app}\{#AppExeName}"; Description: "Launch {#AppName} now"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
Type: filesandordirs; Name: "{app}"
