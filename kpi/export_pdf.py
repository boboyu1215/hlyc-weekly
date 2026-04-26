import asyncio, os
from playwright.async_api import async_playwright

HTML = os.path.abspath(os.path.join(os.path.dirname(__file__), "mindmap.html"))
OUT  = os.path.abspath(os.path.join(os.path.dirname(__file__), "避坑指南.pdf"))

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()

        # 加载本地 HTML
        await page.goto(f"file://{HTML}", wait_until="networkidle")

        # 强制深色背景打印（-webkit-print-color-adjust）
        await page.add_style_tag(content="""
            @media print {
                * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                body { background: #0f1117 !important; }
            }
        """)

        # 获取实际页面高度，做单页 PDF
        height_px = await page.evaluate("document.documentElement.scrollHeight")
        width_px  = 1440  # 固定宽度，保持布局

        # 转换 px → mm（96dpi：1px = 0.2646mm）
        h_mm = round(height_px * 0.2646) + 10
        w_mm = round(width_px  * 0.2646)

        await page.pdf(
            path=OUT,
            width=f"{w_mm}mm",
            height=f"{h_mm}mm",
            print_background=True,
            margin={"top": "0", "bottom": "0", "left": "0", "right": "0"},
        )

        await browser.close()
        print(f"✅ 已生成：{OUT}")
        print(f"   页面尺寸：{w_mm}mm × {h_mm}mm（单页）")

asyncio.run(main())
