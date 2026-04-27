$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$inputPath = Join-Path $root 'logo.png'

if (!(Test-Path $inputPath)) {
  throw "logo.png not found at: $inputPath"
}

foreach ($size in @(192, 512)) {
  $outputPath = Join-Path $root ("icon-$size.png")

  $img = [System.Drawing.Image]::FromFile($inputPath)
  $bmp = New-Object System.Drawing.Bitmap($size, $size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.Clear([System.Drawing.Color]::Transparent)
  $g.DrawImage($img, 0, 0, $size, $size)
  $bmp.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)

  $g.Dispose()
  $bmp.Dispose()
  $img.Dispose()
}

Write-Host "Generated icon-192.png and icon-512.png from logo.png"

