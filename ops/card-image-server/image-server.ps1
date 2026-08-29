param(
    [Parameter(Mandatory = $false)]
    [string]$Root = "C:\dm-card-images",

    [Parameter(Mandatory = $false)]
    [ValidateRange(1, 65535)]
    [int]$Port = 8787,

    [Parameter(Mandatory = $false)]
    [switch]$ValidateOnly
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $Root -PathType Container)) {
    throw "Image root does not exist: $Root"
}

$serverSource = @'
using System;
using System.IO;
using System.Net;
using System.Text;
using System.Threading;

public static class DmCardImageServer
{
    public static void Run(string root, int port)
    {
        string rootPath = Path.GetFullPath(root).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
        HttpListener listener = new HttpListener();
        listener.Prefixes.Add("http://+:" + port + "/");
        listener.Start();

        while (true)
        {
            HttpListenerContext context = listener.GetContext();
            ThreadPool.QueueUserWorkItem(delegate(object state) { Handle(context, rootPath); });
        }
    }

    private static void Handle(HttpListenerContext context, string rootPath)
    {
        try
        {
            AddCommonHeaders(context.Response);

            if (context.Request.HttpMethod == "OPTIONS")
            {
                context.Response.StatusCode = 204;
                context.Response.Close();
                return;
            }

            if (context.Request.HttpMethod != "GET" && context.Request.HttpMethod != "HEAD")
            {
                WriteText(context, 405, "Method Not Allowed");
                return;
            }

            string requestPath = Uri.UnescapeDataString(context.Request.Url.AbsolutePath);
            if (requestPath == "/health")
            {
                context.Response.ContentType = "application/json; charset=utf-8";
                context.Response.Headers["Cache-Control"] = "no-store";
                WriteText(context, 200, "{\"status\":\"ok\"}");
                return;
            }

            string relative = requestPath.TrimStart('/').Replace('/', Path.DirectorySeparatorChar);
            string fullPath = Path.GetFullPath(Path.Combine(rootPath, relative));
            if (!fullPath.StartsWith(rootPath, StringComparison.OrdinalIgnoreCase) ||
                !String.Equals(Path.GetExtension(fullPath), ".webp", StringComparison.OrdinalIgnoreCase) ||
                !File.Exists(fullPath))
            {
                WriteText(context, 404, "Not Found");
                return;
            }

            FileInfo info = new FileInfo(fullPath);
            context.Response.StatusCode = 200;
            context.Response.ContentType = "image/webp";
            context.Response.ContentLength64 = info.Length;
            context.Response.Headers["Cache-Control"] = "public, max-age=31536000, immutable";

            if (context.Request.HttpMethod == "HEAD")
            {
                context.Response.Close();
                return;
            }

            using (FileStream stream = new FileStream(fullPath, FileMode.Open, FileAccess.Read, FileShare.Read, 65536, true))
            {
                stream.CopyTo(context.Response.OutputStream);
            }
            context.Response.OutputStream.Close();
        }
        catch
        {
            try { context.Response.Abort(); } catch { }
        }
    }

    private static void AddCommonHeaders(HttpListenerResponse response)
    {
        response.Headers["Access-Control-Allow-Origin"] = "*";
        response.Headers["Access-Control-Allow-Methods"] = "GET, HEAD, OPTIONS";
        response.Headers["X-Content-Type-Options"] = "nosniff";
    }

    private static void WriteText(HttpListenerContext context, int statusCode, string value)
    {
        byte[] body = Encoding.UTF8.GetBytes(value);
        context.Response.StatusCode = statusCode;
        context.Response.ContentLength64 = body.Length;
        if (context.Request.HttpMethod != "HEAD")
        {
            context.Response.OutputStream.Write(body, 0, body.Length);
        }
        context.Response.OutputStream.Close();
    }
}
'@

Add-Type -TypeDefinition $serverSource -Language CSharp
if ($ValidateOnly) {
    Write-Host "Server code compiled successfully."
    return
}

Write-Host "DM card image server listening on port $Port (root: $Root)"
[DmCardImageServer]::Run($Root, $Port)
