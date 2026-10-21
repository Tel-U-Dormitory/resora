# Administrator UI component sources

Shared dialog composition, tooltips, buttons, inputs, select, checkbox and cards use the existing shadcn/ui + Base UI stack. Dialog composition follows [shadcn Dialog](https://ui.shadcn.com/docs/components/base/dialog); tooltip composition follows [shadcn Tooltip](https://ui.shadcn.com/docs/components/base/tooltip). RESORA theme tokens, consistent 44px action targets, keyboard focus, modal title/description and reduced-motion support are retained.

Account action hover decoration adapts the `::before` sweep from [vinodjangid07's Uiverse button](https://uiverse.io/vinodjangid07/tall-termite-79), read from the [official Uiverse Galaxy archive](https://github.com/uiverse-io/galaxy/blob/main/Buttons/vinodjangid07_tall-termite-79.html). It uses RESORA colors, fixed button dimensions, no active-position translation or blend effect, and shadcn Tooltip for the label. It adds no dependency. Attribution: vinodjangid07 / Uiverse.io.

## Uiverse license

MIT License

Copyright (c) 2023 Uiverse.io

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
