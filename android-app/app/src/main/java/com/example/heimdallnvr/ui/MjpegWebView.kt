package com.example.heimdallnvr.ui

import android.annotation.SuppressLint
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.AndroidView

@SuppressLint("SetJavaScriptEnabled")
@Composable
fun MjpegWebView(
    streamUrl: String,
    modifier: Modifier = Modifier,
    contentFit: String = "contain"
) {
    AndroidView(
        factory = { context ->
            WebView(context).apply {
                settings.apply {
                    javaScriptEnabled = false
                    loadWithOverviewMode = true
                    useWideViewPort = true
                    builtInZoomControls = false
                    displayZoomControls = false
                    cacheMode = WebSettings.LOAD_NO_CACHE
                }
                webViewClient = WebViewClient()
                setBackgroundColor(android.graphics.Color.BLACK)
            }
        },
        update = { webView ->
            val html = """
                <html>
                <head>
                    <style>
                        body {
                            margin: 0;
                            padding: 0;
                            background-color: black;
                            display: flex;
                            justify-content: center;
                            align-items: center;
                            height: 100vh;
                            overflow: hidden;
                        }
                        img {
                            width: 100%;
                            height: 100%;
                            object-fit: $contentFit;
                        }
                    </style>
                </head>
                <body>
                    <img src="$streamUrl" />
                </body>
                </html>
            """.trimIndent()
            webView.loadDataWithBaseURL(null, html, "text/html", "UTF-8", null)
        },
        modifier = modifier
    )
}
