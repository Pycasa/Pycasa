# make-installer-images.ps1
# Generates installer_banner.bmp (164x314) and installer_small.bmp (55x58)
# from favicon.ico using System.Drawing. Run from apps/windows directory.

Add-Type -AssemblyName System.Drawing

$icoPath = Join-Path $PSScriptRoot "favicon.ico"
if (!(Test-Path $icoPath)) {
    Write-Error "favicon.ico not found at $icoPath"
    exit 1
}

# Load the icon — pick the largest available size
$iconStream = [System.IO.File]::OpenRead($icoPath)
$icon = New-Object System.Drawing.Icon($iconStream, 256, 256)
$iconStream.Close()
$srcBmp = $icon.ToBitmap()

# ─────────────────────────────────────────────────────────────
# 1. Wizard Sidebar Banner: 164 x 314 (WizardImageFile)
#    Dark purple gradient + centered Pycasa icon
# ─────────────────────────────────────────────────────────────
$bannerW = 164
$bannerH = 314
$banner  = New-Object System.Drawing.Bitmap($bannerW, $bannerH)
$g       = [System.Drawing.Graphics]::FromImage($banner)
$g.SmoothingMode     = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic

# Gradient background: #1a0533 → #2d1b69
$topColor    = [System.Drawing.Color]::FromArgb(26,  5,  51)
$bottomColor = [System.Drawing.Color]::FromArgb(45, 27, 105)
$rect = New-Object System.Drawing.Rectangle(0, 0, $bannerW, $bannerH)
$lgb  = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    $rect, $topColor, $bottomColor,
    [System.Drawing.Drawing2D.LinearGradientMode]::Vertical
)
$g.FillRectangle($lgb, $rect)

# Accent bar at bottom
$accentColor = [System.Drawing.Color]::FromArgb(99, 60, 180)
$accentBrush = New-Object System.Drawing.SolidBrush($accentColor)
$g.FillRectangle($accentBrush, 0, $bannerH - 6, $bannerW, 6)

# Draw icon centered, upper portion
$iconSize = 88
$ix = [int](($bannerW - $iconSize) / 2)
$iy = 70
$g.DrawImage($srcBmp, $ix, $iy, $iconSize, $iconSize)

# "Pycasa" label
$font      = New-Object System.Drawing.Font("Segoe UI", 16, [System.Drawing.FontStyle]::Bold)
$whiteBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
$strFormat  = New-Object System.Drawing.StringFormat
$strFormat.Alignment = [System.Drawing.StringAlignment]::Center
$labelRect  = New-Object System.Drawing.RectangleF(0, ($iy + $iconSize + 12), $bannerW, 30)
$g.DrawString("Pycasa", $font, $whiteBrush, $labelRect, $strFormat)

# "Photo Library" subtitle
$subFont  = New-Object System.Drawing.Font("Segoe UI", 9, [System.Drawing.FontStyle]::Regular)
$subColor = [System.Drawing.Color]::FromArgb(190, 160, 230)
$subBrush = New-Object System.Drawing.SolidBrush($subColor)
$subRect  = New-Object System.Drawing.RectangleF(0, ($iy + $iconSize + 44), $bannerW, 20)
$g.DrawString("Photo Library", $subFont, $subBrush, $subRect, $strFormat)

$g.Dispose()
$bannerPath = Join-Path $PSScriptRoot "installer_banner.bmp"
$banner.Save($bannerPath, [System.Drawing.Imaging.ImageFormat]::Bmp)
$banner.Dispose()
Write-Host "Generated: installer_banner.bmp (${bannerW}x${bannerH})"

# ─────────────────────────────────────────────────────────────
# 2. Wizard Small Logo: 55 x 58 (WizardSmallImageFile)
#    Dark bg + icon centered
# ─────────────────────────────────────────────────────────────
$smallW = 55
$smallH = 58
$small  = New-Object System.Drawing.Bitmap($smallW, $smallH)
$g2     = [System.Drawing.Graphics]::FromImage($small)
$g2.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic

$rect2 = New-Object System.Drawing.Rectangle(0, 0, $smallW, $smallH)
$lgb2  = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    $rect2, $topColor, $bottomColor,
    [System.Drawing.Drawing2D.LinearGradientMode]::Vertical
)
$g2.FillRectangle($lgb2, $rect2)

$iSize2 = 46
$ix2    = [int](($smallW - $iSize2) / 2)
$iy2    = [int](($smallH - $iSize2) / 2)
$g2.DrawImage($srcBmp, $ix2, $iy2, $iSize2, $iSize2)

$g2.Dispose()
$smallPath = Join-Path $PSScriptRoot "installer_small.bmp"
$small.Save($smallPath, [System.Drawing.Imaging.ImageFormat]::Bmp)
$small.Dispose()
Write-Host "Generated: installer_small.bmp (${smallW}x${smallH})"

$srcBmp.Dispose()
Write-Host "Installer images ready."
