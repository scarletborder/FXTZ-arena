param(
  [string]$AssetsRoot = "apps/frontend/public/assets/bullet",
  [string]$OutputRoot = "apps/frontend/public/assets/temp_bullet",
  [int]$PreviewCellSize = 72
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$assetsPath = (Resolve-Path -LiteralPath $AssetsRoot).Path
$configPath = Join-Path $assetsPath "bullet_config.json"
if (!(Test-Path -LiteralPath $configPath)) {
  throw "Bullet configuration not found: $configPath"
}

if (!(Test-Path -LiteralPath $OutputRoot)) {
  New-Item -ItemType Directory -Path $OutputRoot -Force | Out-Null
}
$outputPath = (Resolve-Path -LiteralPath $OutputRoot).Path
if ($outputPath -eq $assetsPath) {
  throw "OutputRoot must not be the source assets folder."
}

function Export-AllBulletPreviews {
  $config = Get-Content -Raw -LiteralPath $configPath | ConvertFrom-Json
  $entries = [System.Collections.Generic.List[object]]::new()
  $previewEntries = [System.Collections.Generic.List[object]]::new()
  $sourceImages = @{}

  try {
  foreach ($bullet in $config.bullet_config) {
    $sourceName = [string]$bullet.source
    $source = Get-SourceImage $sourceImages $assetsPath $sourceName
    $animationFrames = @(Get-BulletFrames $bullet)

    for ($offsetIndex = 0; $offsetIndex -lt $bullet.offset.Count; $offsetIndex += 1) {
      $offset = $bullet.offset[$offsetIndex]
      for ($frameIndex = 0; $frameIndex -lt $animationFrames.Count; $frameIndex += 1) {
        $frame = $animationFrames[$frameIndex]
        $x = [int]($frame.x + $offset[0])
        $y = [int]($frame.y + $offset[1])
        $width = [int]$frame.width
        $height = [int]$frame.height
        Assert-CropBounds $source $sourceName $bullet.id $x $y $width $height

        $filename = "{0}_offset-{1:D2}_frame-{2:D2}.png" -f $bullet.id, $offsetIndex, $frameIndex
        $filePath = Join-Path $outputPath $filename
        Export-Crop $source $filePath $x $y $width $height

        $entry = [PSCustomObject]@{
          id = [string]$bullet.id
          source = $sourceName
          offset = $offsetIndex
          frame = $frameIndex
          frameCount = $animationFrames.Count
          durationSeconds = $frame.duration
          hitBox = @($bullet.hit_box[0], $bullet.hit_box[1])
          crop = @($x, $y, $width, $height)
          file = $filename
        }
        $entries.Add($entry)
        if ($frameIndex -eq 0) {
          $previewEntries.Add($entry)
        }
      }
    }
  }

  if ($null -ne $config.bullet_break_anim) {
    $breakSourceName = [string]$config.bullet_break_anim.source
    $breakSource = Get-SourceImage $sourceImages $assetsPath $breakSourceName
    for ($frameIndex = 0; $frameIndex -lt $config.bullet_break_anim.anim.Count; $frameIndex += 1) {
      $frame = $config.bullet_break_anim.anim[$frameIndex]
      $x = [int]$frame.frame[0]
      $y = [int]$frame.frame[1]
      $width = [int]$frame.frame[2]
      $height = [int]$frame.frame[3]
      Assert-CropBounds $breakSource $breakSourceName "bullet_break_anim" $x $y $width $height
      $filename = "bullet_break_anim_frame-{0:D2}.png" -f $frameIndex
      Export-Crop $breakSource (Join-Path $outputPath $filename) $x $y $width $height
      $entries.Add([PSCustomObject]@{
        id = "bullet_break_anim"
        source = $breakSourceName
        offset = 0
        frame = $frameIndex
        frameCount = $config.bullet_break_anim.anim.Count
        durationSeconds = [float]$frame.duration
        hitBox = $null
        crop = @($x, $y, $width, $height)
        file = $filename
      })
    }
  }

  $manifest = [PSCustomObject]@{
    generatedFrom = "assets/bullet/bullet_config.json"
    usage = "bullet entries export rect + offset; animated entries additionally export each frame"
    bulletPreviewCount = $previewEntries.Count
    exportedImageCount = $entries.Count
    entries = $entries
  }
  $manifest | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $outputPath "manifest.json") -Encoding UTF8

  Export-ContactSheet $previewEntries $entries $outputPath $PreviewCellSize
  Write-Host "Exported $($entries.Count) frames ($($previewEntries.Count) bullet variants) to $outputPath"
  Write-Host "Review: $(Join-Path $outputPath 'contact-sheet.png')"
  } finally {
    foreach ($image in $sourceImages.Values) {
      $image.Dispose()
    }
  }
}

function Get-SourceImage($cache, [string]$root, [string]$sourceName) {
  if (!$cache.ContainsKey($sourceName)) {
    $path = Join-Path $root "$sourceName.png"
    if (!(Test-Path -LiteralPath $path)) {
      throw "Source texture not found: $path"
    }
    $cache[$sourceName] = [System.Drawing.Bitmap]::FromFile($path)
  }
  return $cache[$sourceName]
}

function Get-BulletFrames($bullet) {
  $frames = [System.Collections.Generic.List[object]]::new()
  if ($null -ne $bullet.anim) {
    for ($frameIndex = 0; $frameIndex -lt [int]$bullet.anim.times; $frameIndex += 1) {
      $frames.Add([PSCustomObject]@{
        x = [int]$bullet.rect[0] + $frameIndex * [int]$bullet.anim.rect_offset
        y = [int]$bullet.rect[1]
        width = [int]$bullet.rect[2]
        height = [int]$bullet.rect[3]
        duration = [float]$bullet.anim.duration
      })
    }
  } else {
    $frames.Add([PSCustomObject]@{
      x = [int]$bullet.rect[0]
      y = [int]$bullet.rect[1]
      width = [int]$bullet.rect[2]
      height = [int]$bullet.rect[3]
      duration = $null
    })
  }
  return $frames
}

function Assert-CropBounds(
  [System.Drawing.Bitmap]$source,
  [string]$sourceName,
  [string]$id,
  [int]$x,
  [int]$y,
  [int]$width,
  [int]$height
) {
  if ($x -lt 0 -or $y -lt 0 -or $width -le 0 -or $height -le 0 -or
    $x + $width -gt $source.Width -or $y + $height -gt $source.Height) {
    throw "Crop for $id is outside $sourceName.png: [$x, $y, $width, $height] in $($source.Width)x$($source.Height)"
  }
}

function Export-Crop(
  [System.Drawing.Bitmap]$source,
  [string]$targetPath,
  [int]$x,
  [int]$y,
  [int]$width,
  [int]$height
) {
  $target = New-Object System.Drawing.Bitmap $width, $height, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  try {
    $graphics = [System.Drawing.Graphics]::FromImage($target)
    try {
      $graphics.Clear([System.Drawing.Color]::Transparent)
      $graphics.DrawImage(
        $source,
        (New-Object System.Drawing.Rectangle 0, 0, $width, $height),
        (New-Object System.Drawing.Rectangle $x, $y, $width, $height),
        [System.Drawing.GraphicsUnit]::Pixel
      )
    } finally {
      $graphics.Dispose()
    }
    $target.Save($targetPath, [System.Drawing.Imaging.ImageFormat]::Png)
  } finally {
    $target.Dispose()
  }
}

function Export-ContactSheet($previews, $allEntries, [string]$root, [int]$cellSize) {
  $groups = @($previews | Group-Object id)
  $leftMargin = 176
  $topMargin = 52
  $rowHeight = $cellSize + 28
  $maxColumns = ($groups | ForEach-Object { $_.Count } | Measure-Object -Maximum).Maximum
  $width = $leftMargin + [int]$maxColumns * $cellSize + 24
  $height = $topMargin + $groups.Count * $rowHeight + 36
  $sheet = New-Object System.Drawing.Bitmap $width, $height, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  try {
    $graphics = [System.Drawing.Graphics]::FromImage($sheet)
    $titleFont = New-Object System.Drawing.Font "Segoe UI", 16, ([System.Drawing.FontStyle]::Bold)
    $labelFont = New-Object System.Drawing.Font "Consolas", 10
    $smallFont = New-Object System.Drawing.Font "Consolas", 8
    $white = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(238, 242, 247))
    $muted = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(171, 184, 199))
    $panel = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(30, 36, 49))
    try {
      $graphics.Clear([System.Drawing.Color]::FromArgb(15, 19, 27))
      $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
      $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
      $graphics.DrawString("Bullet config variants (first animation frame shown)", $titleFont, $white, 16, 14)

      for ($groupIndex = 0; $groupIndex -lt $groups.Count; $groupIndex += 1) {
        $group = $groups[$groupIndex]
        $y = $topMargin + $groupIndex * $rowHeight
        $first = $group.Group[0]
        $animLabel = if ($first.frameCount -gt 1) { "  anim x$($first.frameCount)" } else { "" }
        $graphics.FillRectangle($panel, 8, $y - 4, $width - 16, $rowHeight - 6)
        $graphics.DrawString("$($group.Name)$animLabel", $labelFont, $white, 16, $y + 16)
        $graphics.DrawString("hit $($first.hitBox[0])x$($first.hitBox[1])", $smallFont, $muted, 16, $y + 38)

        for ($index = 0; $index -lt $group.Count; $index += 1) {
          $entry = $group.Group[$index]
          $image = [System.Drawing.Bitmap]::FromFile((Join-Path $root $entry.file))
          try {
            $maxImageSize = $cellSize - 20
            $scale = [Math]::Min($maxImageSize / $image.Width, $maxImageSize / $image.Height)
            $drawWidth = [int]($image.Width * $scale)
            $drawHeight = [int]($image.Height * $scale)
            $x = $leftMargin + $index * $cellSize + [int](($cellSize - $drawWidth) / 2)
            $imageY = $y + 4 + [int](($maxImageSize - $drawHeight) / 2)
            $graphics.DrawImage($image, $x, $imageY, $drawWidth, $drawHeight)
            $graphics.DrawString(("{0:D2}" -f $entry.offset), $smallFont, $muted, $leftMargin + $index * $cellSize + 28, $y + $cellSize - 8)
          } finally {
            $image.Dispose()
          }
        }
      }
    } finally {
      $white.Dispose()
      $muted.Dispose()
      $panel.Dispose()
      $titleFont.Dispose()
      $labelFont.Dispose()
      $smallFont.Dispose()
      $graphics.Dispose()
    }
    $sheet.Save((Join-Path $root "contact-sheet.png"), [System.Drawing.Imaging.ImageFormat]::Png)
  } finally {
    $sheet.Dispose()
  }
}

Export-AllBulletPreviews
