param(
  [string]$CharactersRoot = "apps/frontend/public/assets/characters",
  [int]$Inset = 1,
  [int]$OutputFrameSize = 520
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$root = Resolve-Path -LiteralPath $CharactersRoot
$sourceFiles = Get-ChildItem -LiteralPath $root -Recurse -Filter "combat.png"
$offsets = @{
  reimu = @{
    down = @{ x = -6; y = 0 }
    up = @{ x = 6; y = 0 }
    left = @{ x = 10; y = 0 }
  }
  marisa = @{
    down = @{ x = -5; y = 0 }
    left = @{ x = 20; y = 0 }
  }
  sakuya = @{
    down = @{ x = -8; y = -5 }
    up = @(
      @{ x = 0; y = 0 },
      @{ x = 5; y = -5 }
    )
    left = @{ x = 10; y = -10 }
  }
  cirno = @{
    down = @{ x = 4; y = 0 }
    up = @{ x = 4; y = 0 }
    left = @{ x = 15; y = 0 }
  }
}
$directionByColumn = @("down", "up", "left")

foreach ($sourceFile in $sourceFiles) {
  $characterId = $sourceFile.Directory.Name
  $source = [System.Drawing.Bitmap]::FromFile($sourceFile.FullName)
  try {
    if ($source.Width * 2 -ne $source.Height * 3) {
      throw "Expected a 3:2 combat sheet, got $($source.Width)x$($source.Height): $($sourceFile.FullName)"
    }

    $sourceFrameWidth = [int]($source.Width / 3)
    $sourceFrameHeight = [int]($source.Height / 2)
    if ($sourceFrameWidth -le $Inset * 2 -or $sourceFrameHeight -le $Inset * 2) {
      throw "Inset $Inset is too large for frame $sourceFrameWidth x $sourceFrameHeight"
    }

    $trimmedFrameWidth = $sourceFrameWidth - $Inset * 2
    $trimmedFrameHeight = $sourceFrameHeight - $Inset * 2
    if ($OutputFrameSize -lt $trimmedFrameWidth -or $OutputFrameSize -lt $trimmedFrameHeight) {
      throw "Output frame $OutputFrameSize is smaller than trimmed frame $trimmedFrameWidth x $trimmedFrameHeight"
    }

    $target = New-Object System.Drawing.Bitmap ($OutputFrameSize * 3), ($OutputFrameSize * 2), ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    try {
      $graphics = [System.Drawing.Graphics]::FromImage($target)
      try {
        $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighSpeed
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
        $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
        $graphics.Clear([System.Drawing.Color]::Transparent)

        for ($row = 0; $row -lt 2; $row += 1) {
          for ($column = 0; $column -lt 3; $column += 1) {
            $sourceX = $column * $sourceFrameWidth + $Inset
            $sourceY = $row * $sourceFrameHeight + $Inset
            $direction = $directionByColumn[$column]
            $offset = Resolve-FrameOffset $offsets $characterId $direction $row
            $targetX = $column * $OutputFrameSize + [int](($OutputFrameSize - $trimmedFrameWidth) / 2) + $offset.x
            $targetY = $row * $OutputFrameSize + [int](($OutputFrameSize - $trimmedFrameHeight) / 2) + $offset.y
            $sourceRect = New-Object System.Drawing.Rectangle -ArgumentList @($sourceX, $sourceY, $trimmedFrameWidth, $trimmedFrameHeight)
            $targetRect = New-Object System.Drawing.Rectangle -ArgumentList @($targetX, $targetY, $trimmedFrameWidth, $trimmedFrameHeight)
            $graphics.DrawImage($source, $targetRect, $sourceRect, [System.Drawing.GraphicsUnit]::Pixel)
          }
        }
      } finally {
        $graphics.Dispose()
      }

      $targetPath = Join-Path $sourceFile.DirectoryName "combatSheet.png"
      $target.Save($targetPath, [System.Drawing.Imaging.ImageFormat]::Png)
      Write-Host "Wrote $targetPath ($($target.Width)x$($target.Height), frame $OutputFrameSize x $OutputFrameSize, trimmed $trimmedFrameWidth x $trimmedFrameHeight)"
    } finally {
      $target.Dispose()
    }
  } finally {
    $source.Dispose()
  }
}

function Resolve-FrameOffset($offsetTable, [string]$characterId, [string]$direction, [int]$row) {
  $zero = @{ x = 0; y = 0 }
  if (!$offsetTable.ContainsKey($characterId)) {
    return $zero
  }
  $characterOffsets = $offsetTable[$characterId]
  if (!$characterOffsets.ContainsKey($direction)) {
    return $zero
  }
  $directionOffset = $characterOffsets[$direction]
  if ($directionOffset -is [array]) {
    return $directionOffset[$row]
  }
  return $directionOffset
}
