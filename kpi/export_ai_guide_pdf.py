#!/usr/bin/env python3
"""将 ai-dev-guide.html 导出为单页深色背景 PDF"""

import asyncio, os
from pathlib import Path
from playwright.async_api import async_playwright

HTML = Path(__file__).parent / "ai-dev-guide.html"
OUT  = Path(__file__).parent / "AI辅助开发流程指南.pdf"

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page(viewport={"width": 1440, "height": 900})

        await page.goto(f"file://{HTML.resolve()}", wait_until="networkidle")

        # 隐藏 sticky nav-bar（避免遮挡内容）
        await page.add_style_tag(content="""
            .nav-bar { display: none !important; }
            body { padding-top: 0 !important; }
            /* 强制背景深色 */
            * { -webkit-print-color-adjust: exact !important; color-adjust: exact !important; }
        """)

        # 等待字体渲染
        await page.wait_for_timeout(800)

        # 获取完整页面高度
        height = await page.evaluate("document.documentElement.scrollHeight")
        width  = await page.evaluate("document.documentElement.scrollWidth")
        print(f"页面尺寸: {width} × {height} px")

        # 单页 PDF：把整个页面放进一张纸
        # 转换 px → mm（96dpi）
        w_mm = round(width  / 96 * 25.4, 1)
        h_mm = round(height / 96 * 25.4, 1)
        print(f"PDF 尺寸: {w_mm} × {h_mm} mm")

        await page.pdf(
            path=str(OUT),
            width=f"{w_mm}mm",
            height=f"{h_mm}mm",
            print_background=True,
            margin={"top": "0", "bottom": "0", "left": "0", "right": "0"},
        )

        await browser.close()
        print(f"✅ 已生成：{OUT}")

asyncio.run(main())
