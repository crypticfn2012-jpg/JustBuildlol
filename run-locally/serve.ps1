# Tiny static web server for the "web" folder (no installs needed on Windows).
# Usage: right-click > Run with PowerShell, or run "Play on Windows.bat".
param([int]$Port = 8080)
$root = (Resolve-Path (Join-Path $PSScriptRoot "..\web")).Path
$types = @{
  ".html" = "text/html; charset=utf-8"; ".js" = "text/javascript"; ".mjs" = "text/javascript"; ".css" = "text/css";
  ".json" = "application/json"; ".webmanifest" = "application/manifest+json"; ".svg" = "image/svg+xml";
  ".png" = "image/png"; ".jpg" = "image/jpeg"; ".jpeg" = "image/jpeg"; ".webp" = "image/webp"; ".ico" = "image/x-icon";
  ".glb" = "model/gltf-binary"; ".gltf" = "model/gltf+json"; ".bin" = "application/octet-stream";
  ".wasm" = "application/wasm"; ".mp3" = "audio/mpeg"; ".ogg" = "audio/ogg"; ".wav" = "audio/wav"; ".woff" = "font/woff"; ".woff2" = "font/woff2"
}
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "Driftwood Royale is running at http://localhost:$Port/  (close this window to stop)"
Start-Process "http://localhost:$Port/"
while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $path = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath.TrimStart("/"))
  if ($path -eq "") { $path = "index.html" }
  $file = [IO.Path]::GetFullPath((Join-Path $root $path))
  if (-not $file.StartsWith($root) -or -not (Test-Path $file -PathType Leaf)) { $file = Join-Path $root "index.html" }
  $ext = [IO.Path]::GetExtension($file).ToLower()
  $ctx.Response.ContentType = if ($types.ContainsKey($ext)) { $types[$ext] } else { "application/octet-stream" }
  $bytes = [IO.File]::ReadAllBytes($file)
  $ctx.Response.ContentLength64 = $bytes.Length
  $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
  $ctx.Response.Close()
}
