param(
    [string]$BindAddress = '127.0.0.1',
    [int]$Port = 8765,
    [string]$RootPath = (Split-Path -Parent $MyInvocation.MyCommand.Path)
)

$ErrorActionPreference = 'Stop'
$resolvedRoot = [System.IO.Path]::GetFullPath($RootPath)
$prefix = "http://${BindAddress}:${Port}/"

$contentTypes = @{
    '.html' = 'text/html; charset=utf-8'
    '.svg' = 'image/svg+xml'
    '.js' = 'application/javascript; charset=utf-8'
    '.css' = 'text/css; charset=utf-8'
    '.json' = 'application/json; charset=utf-8'
    '.txt' = 'text/plain; charset=utf-8'
}

$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add($prefix)
$listener.Start()

Write-Host "[OK] Serving $resolvedRoot"
Write-Host "[OK] Open $prefix`index.html"
Write-Host "[TIP] Press Ctrl+C or close this window to stop the server."

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $requestPath = [System.Uri]::UnescapeDataString($context.Request.Url.AbsolutePath.TrimStart('/'))
        if ([string]::IsNullOrWhiteSpace($requestPath)) {
            $requestPath = 'index.html'
        }

        $candidatePath = [System.IO.Path]::GetFullPath((Join-Path $resolvedRoot $requestPath))
        $response = $context.Response

        try {
            if (-not $candidatePath.StartsWith($resolvedRoot, [System.StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path $candidatePath -PathType Leaf)) {
                $response.StatusCode = 404
                $bytes = [System.Text.Encoding]::UTF8.GetBytes('404 Not Found')
                $response.ContentType = 'text/plain; charset=utf-8'
            }
            else {
                $extension = [System.IO.Path]::GetExtension($candidatePath).ToLowerInvariant()
                $response.StatusCode = 200
                $response.ContentType = $contentTypes[$extension]
                if (-not $response.ContentType) {
                    $response.ContentType = 'application/octet-stream'
                }
                $bytes = [System.IO.File]::ReadAllBytes($candidatePath)
            }

            $response.ContentLength64 = $bytes.Length
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
        }
        catch {
            $response.StatusCode = 500
            $bytes = [System.Text.Encoding]::UTF8.GetBytes('500 Internal Server Error')
            $response.ContentType = 'text/plain; charset=utf-8'
            $response.ContentLength64 = $bytes.Length
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
        }
        finally {
            $response.OutputStream.Close()
        }
    }
}
finally {
    if ($listener.IsListening) {
        $listener.Stop()
    }
    $listener.Close()
}
