; ============================================================
;  Pycasa Windows Installer — Inno Setup Script
;  Builds: PycasaSetup.exe
; ============================================================

#define AppName      "Pycasa"
#define AppVersion   GetVersionNumbersString("Pycasa.exe")
#define AppPublisher "Pycasa"
#define AppURL       "https://github.com/Pycasa/Pycasa"
#define AppExeName   "Pycasa.exe"
#define AppIcon      "favicon.ico"

[Setup]
; Basic identity
AppId={{8F3A2B1C-4D5E-6F7A-8B9C-0D1E2F3A4B5C}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} {#AppVersion}
AppPublisher={#AppPublisher}
AppPublisherURL={#AppURL}
AppSupportURL={#AppURL}/issues
AppUpdatesURL={#AppURL}/releases

; Installation paths
DefaultDirName={autopf}\{#AppName}
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes

; Installer output
OutputDir=dist
OutputBaseFilename=PycasaSetup
SetupIconFile={#AppIcon}
UninstallDisplayIcon={app}\{#AppExeName}
UninstallDisplayName={#AppName}

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
; These are checkboxes shown to the user during install
Name: "desktopicon";   Description: "Create a &Desktop shortcut";   GroupDescription: "Additional shortcuts:"
Name: "startmenuicon"; Description: "Create a &Start Menu shortcut"; GroupDescription: "Additional shortcuts:"

[Files]
; Main executable — the JAR is downloaded at first launch by the exe itself
Source: "Pycasa.exe";  DestDir: "{app}"; DestName: "{#AppExeName}"; Flags: ignoreversion
Source: "favicon.ico"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
; Start Menu
Name: "{group}\{#AppName}";           Filename: "{app}\{#AppExeName}"; IconFilename: "{app}\favicon.ico"; Tasks: startmenuicon
Name: "{group}\Uninstall {#AppName}"; Filename: "{uninstallexe}";                                         Tasks: startmenuicon

; Desktop
Name: "{autodesktop}\{#AppName}";     Filename: "{app}\{#AppExeName}"; IconFilename: "{app}\favicon.ico"; Tasks: desktopicon


[Run]
; Offer to launch Pycasa right after installation finishes
Filename: "{app}\{#AppExeName}"; Description: "Launch {#AppName} now"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
; Clean up any files the app creates in its install dir at runtime
Type: filesandordirs; Name: "{app}"
