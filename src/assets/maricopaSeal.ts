/**
 * Official Seal of Maricopa County, Arizona (Vector SVG + High-DPI PNG Renderer for .DOCX Export)
 *
 * Visual Elements:
 * - Outer dark red circular border (#a60917) framing a deep navy blue ring (#112e76)
 * - Cream/gold serif lettering arched along top ("MARICOPA") and bottom ("COUNTY")
 * - Below "MARICOPA", curved red ribbon banner reading "18" on left and "71" on right,
 *   centered with a white-and-green desert poppy blossom
 * - Flanking central shield: green saguaro cacti (#4a8b2c) with cream vertical ribs on green desert mounds
 * - Central heraldic shield:
 *   * Top cream chief bar reading "ARIZONA" in navy serif capitals
 *   * Top-left quadrant (red bg): white balanced Scales of Justice
 *   * Top-right quadrant (white bg): green desert mountain horizon with curved highway/canal perspective lines
 *   * Bottom-left quadrant (white bg): green desert tree and green silhouette of rider on horseback
 *   * Bottom-right quadrant (red bg): white winged Caduceus (staff with intertwined serpents and wings)
 */

export const MARICOPA_SEAL_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300" width="300" height="300">
  <defs>
    <!-- Top text arc (clockwise, centered in navy ring r=102..138) -->
    <path id="mcTopArc" d="M 37,150 A 113,113 0 1,1 263,150" />
    <!-- Bottom text arc (counter-clockwise so letters stand upright left-to-right) -->
    <path id="mcBottomArc" d="M 23,150 A 127,127 0 1,0 277,150" />
    <!-- Inner circular field clip -->
    <clipPath id="mcInnerCircleClip">
      <circle cx="150" cy="150" r="99" />
    </clipPath>
    <!-- Central heraldic shield clip -->
    <clipPath id="mcShieldClip">
      <path d="M 98,95 L 202,95 L 202,158 C 202,193 177,215 150,228 C 123,215 98,193 98,158 Z" />
    </clipPath>
  </defs>

  <!-- Outer Dark Red Border (#a60917) -->
  <circle cx="150" cy="150" r="148" fill="#a60917" />
  <circle cx="150" cy="150" r="144" fill="none" stroke="#f5e6c4" stroke-width="1.5" opacity="0.65" />

  <!-- Deep Navy Blue Ring (#112e76) -->
  <circle cx="150" cy="150" r="139" fill="#112e76" stroke="#f5e6c4" stroke-width="2" />

  <!-- Arched Serif Lettering: MARICOPA (top) & COUNTY (bottom) -->
  <text fill="#f5e6c4" font-family="Georgia, 'Times New Roman', Times, serif" font-size="21.5" font-weight="bold" letter-spacing="4.5">
    <textPath href="#mcTopArc" startOffset="50%" text-anchor="middle">MARICOPA</textPath>
  </text>
  <text fill="#f5e6c4" font-family="Georgia, 'Times New Roman', Times, serif" font-size="21" font-weight="bold" letter-spacing="5">
    <textPath href="#mcBottomArc" startOffset="50%" text-anchor="middle">COUNTY</textPath>
  </text>

  <!-- Decorative 5-pointed cream stars on left and right of navy ring -->
  <polygon points="30,143 32,148 37,148 33,151 34.5,156 30,153 25.5,156 27,151 23,148 28,148" fill="#f5e6c4" />
  <polygon points="270,143 272,148 277,148 273,151 274.5,156 270,153 265.5,156 267,151 263,148 268,148" fill="#f5e6c4" />

  <!-- Inner Circular Field -->
  <circle cx="150" cy="150" r="100" fill="#fbf8ef" stroke="#f5e6c4" stroke-width="2.2" />

  <g clip-path="url(#mcInnerCircleClip)">
    <!-- Subtle inner border line -->
    <circle cx="150" cy="150" r="98" fill="#fbf8ef" />

    <!-- Green Desert Mounds Flanking Base (#4a8b2c) -->
    <path d="M 45,212 Q 76,192 114,210 L 150,226 L 186,210 Q 224,192 255,212 L 255,255 L 45,255 Z" fill="#4a8b2c" />
    <path d="M 52,222 Q 82,206 116,219" fill="none" stroke="#f5e6c4" stroke-width="1.3" stroke-linecap="round" opacity="0.85" />
    <path d="M 248,222 Q 218,206 184,219" fill="none" stroke="#f5e6c4" stroke-width="1.3" stroke-linecap="round" opacity="0.85" />
    <path d="M 105,235 Q 150,224 195,235" fill="none" stroke="#f5e6c4" stroke-width="1.3" stroke-linecap="round" opacity="0.85" />

    <!-- Left Saguaro Cactus (#4a8b2c with cream vertical ribs) -->
    <g>
      <!-- Trunk -->
      <rect x="70" y="114" width="12" height="92" rx="6" fill="#4a8b2c" />
      <!-- Left Arm -->
      <path d="M 72,162 L 60,162 Q 55,162 55,156 L 55,134 Q 55,129 60,129 Q 65,129 65,134 L 65,153 L 72,153 Z" fill="#4a8b2c" />
      <!-- Right Arm -->
      <path d="M 80,152 L 90,152 Q 95,152 95,146 L 95,127 Q 95,122 90,122 Q 85,122 85,127 L 85,143 L 80,143 Z" fill="#4a8b2c" />
      <!-- Cream Vertical Ribs -->
      <line x1="74" y1="118" x2="74" y2="202" stroke="#f5e6c4" stroke-width="1.1" />
      <line x1="78" y1="118" x2="78" y2="202" stroke="#f5e6c4" stroke-width="1.1" />
      <path d="M 60,133 L 60,156 Q 60,158 64,158 L 71,158" fill="none" stroke="#f5e6c4" stroke-width="1" />
      <path d="M 90,126 L 90,146 Q 90,148 86,148 L 81,148" fill="none" stroke="#f5e6c4" stroke-width="1" />
    </g>

    <!-- Right Saguaro Cactus (#4a8b2c with cream vertical ribs) -->
    <g>
      <!-- Trunk -->
      <rect x="218" y="114" width="12" height="92" rx="6" fill="#4a8b2c" />
      <!-- Left Arm -->
      <path d="M 220,152 L 210,152 Q 205,152 205,146 L 205,127 Q 205,122 210,122 Q 215,122 215,127 L 215,143 L 220,143 Z" fill="#4a8b2c" />
      <!-- Right Arm -->
      <path d="M 228,162 L 240,162 Q 245,162 245,156 L 245,134 Q 245,129 240,129 Q 235,129 235,134 L 235,153 L 228,153 Z" fill="#4a8b2c" />
      <!-- Cream Vertical Ribs -->
      <line x1="222" y1="118" x2="222" y2="202" stroke="#f5e6c4" stroke-width="1.1" />
      <line x1="226" y1="118" x2="226" y2="202" stroke="#f5e6c4" stroke-width="1.1" />
      <path d="M 210,126 L 210,146 Q 210,148 214,148 L 219,148" fill="none" stroke="#f5e6c4" stroke-width="1" />
      <path d="M 240,133 L 240,156 Q 240,158 236,158 L 229,158" fill="none" stroke="#f5e6c4" stroke-width="1" />
    </g>

    <!-- Curved Red Ribbon Banner ("18" on left, "71" on right) -->
    <g>
      <!-- Ribbon tail left -->
      <polygon points="74,84 88,75 86,93 77,91 80,86" fill="#850712" />
      <!-- Ribbon tail right -->
      <polygon points="226,84 212,75 214,93 223,91 220,86" fill="#850712" />
      <!-- Left ribbon arch ("18") -->
      <path d="M 84,76 Q 112,62 138,68 L 136,86 Q 112,80 86,92 Z" fill="#a60917" stroke="#112e76" stroke-width="1" />
      <!-- Right ribbon arch ("71") -->
      <path d="M 162,68 Q 188,62 216,76 L 214,92 Q 188,80 164,86 Z" fill="#a60917" stroke="#112e76" stroke-width="1" />
      <text x="111" y="81" text-anchor="middle" fill="#f5e6c4" font-family="Georgia, 'Times New Roman', serif" font-size="13.5" font-weight="bold">18</text>
      <text x="189" y="81" text-anchor="middle" fill="#f5e6c4" font-family="Georgia, 'Times New Roman', serif" font-size="13.5" font-weight="bold">71</text>

      <!-- Centered White-and-Green Desert Poppy / Blossom -->
      <g transform="translate(150, 75)">
        <!-- Green calyx / desert leaves behind blossom -->
        <path d="M -15,6 Q -8,-2 0,3 Q 8,-2 15,6 Q 7,10 0,7 Q -7,10 -15,6 Z" fill="#4a8b2c" />
        <path d="M -9,-10 L 0,0 L 9,-10" fill="none" stroke="#4a8b2c" stroke-width="2.2" stroke-linecap="round" />
        <!-- Five crisp white blossom petals -->
        <circle cx="0" cy="-8" r="6.2" fill="#ffffff" stroke="#112e76" stroke-width="1" />
        <circle cx="-7.5" cy="-2.5" r="6.2" fill="#ffffff" stroke="#112e76" stroke-width="1" />
        <circle cx="7.5" cy="-2.5" r="6.2" fill="#ffffff" stroke="#112e76" stroke-width="1" />
        <circle cx="-4.8" cy="6" r="6.2" fill="#ffffff" stroke="#112e76" stroke-width="1" />
        <circle cx="4.8" cy="6" r="6.2" fill="#ffffff" stroke="#112e76" stroke-width="1" />
        <circle cx="0" cy="0" r="5.5" fill="#ffffff" />
        <!-- Green & gold poppy center -->
        <circle cx="0" cy="0" r="4" fill="#4a8b2c" />
        <circle cx="0" cy="0" r="2" fill="#f5e6c4" />
      </g>
    </g>

    <!-- Central Heraldic Shield -->
    <g clip-path="url(#mcShieldClip)">
      <!-- Chief Bar (top cream strip reading ARIZONA) -->
      <rect x="96" y="95" width="108" height="23" fill="#f5e6c4" />
      <text x="150" y="111.5" text-anchor="middle" fill="#112e76" font-family="Georgia, 'Times New Roman', Times, serif" font-size="13.5" font-weight="bold" letter-spacing="2">ARIZONA</text>

      <!-- Quadrant 1: Top-Left (Red bg, White Balanced Scales of Justice) -->
      <rect x="96" y="118" width="54" height="49" fill="#a60917" />
      <g transform="translate(125, 142)" stroke="#ffffff" fill="none">
        <!-- Central pillar & base -->
        <line x1="0" y1="-16" x2="0" y2="16" stroke-width="2" />
        <path d="M -8,16 L 8,16" stroke-width="2.2" stroke-linecap="round" />
        <circle cx="0" cy="-17" r="2" fill="#ffffff" stroke="none" />
        <!-- Balance beam -->
        <path d="M -16,-11 L 16,-11" stroke-width="1.8" stroke-linecap="round" />
        <!-- Left scale cords & pan -->
        <line x1="-15" y1="-11" x2="-19" y2="3" stroke-width="1.1" />
        <line x1="-15" y1="-11" x2="-11" y2="3" stroke-width="1.1" />
        <path d="M -20.5,3 Q -15,8.5 -9.5,3 Z" fill="#ffffff" stroke="none" />
        <!-- Right scale cords & pan -->
        <line x1="15" y1="-11" x2="11" y2="3" stroke-width="1.1" />
        <line x1="15" y1="-11" x2="19" y2="3" stroke-width="1.1" />
        <path d="M 9.5,3 Q 15,8.5 20.5,3 Z" fill="#ffffff" stroke="none" />
      </g>

      <!-- Quadrant 2: Top-Right (White bg, Green Desert Mountain Horizon & Highway/Canal Perspective) -->
      <rect x="150" y="118" width="54" height="49" fill="#ffffff" />
      <g>
        <!-- Green mountain range silhouette -->
        <polygon points="150,141 157,132 163,137 171,126 178,135 185,129 193,136 202,131 202,141" fill="#4a8b2c" />
        <!-- Horizon line -->
        <line x1="150" y1="141" x2="202" y2="141" stroke="#4a8b2c" stroke-width="1.5" />
        <!-- Curved highway / canal perspective lines converging to horizon pass -->
        <path d="M 173,141 Q 167,153 154,166 L 164,166 Q 171,153 175,141 Z" fill="#4a8b2c" />
        <path d="M 176,141 Q 181,153 194,166" fill="none" stroke="#4a8b2c" stroke-width="1.8" />
        <path d="M 152,152 Q 163,149 171,144" fill="none" stroke="#4a8b2c" stroke-width="1.1" />
        <path d="M 179,144 Q 189,149 200,152" fill="none" stroke="#4a8b2c" stroke-width="1.1" />
      </g>

      <!-- Quadrant 3: Bottom-Left (White bg, Green Desert Tree & Rider on Horseback) -->
      <rect x="96" y="167" width="54" height="63" fill="#ffffff" />
      <g fill="#4a8b2c">
        <!-- Desert ground mound -->
        <path d="M 98,205 Q 125,201 150,206 L 150,228 L 98,228 Z" opacity="0.22" />
        <path d="M 102,205 Q 126,202 149,205" fill="none" stroke="#4a8b2c" stroke-width="1.6" />
        <!-- Desert Tree (left side of quadrant) -->
        <rect x="112" y="186" width="3" height="19" rx="1" />
        <path d="M 113.5,191 L 108,186 M 113.5,190 L 119,185" stroke="#4a8b2c" stroke-width="1.6" fill="none" />
        <ellipse cx="113.5" cy="181" rx="10" ry="6.5" />
        <ellipse cx="108" cy="184" rx="6" ry="4.5" />
        <ellipse cx="119" cy="184" rx="6" ry="4.5" />
        <!-- Silhouette of Rider on Horseback (right side of quadrant) -->
        <!-- Rider torso, head & hat -->
        <circle cx="134" cy="182" r="2.3" />
        <path d="M 130.5,181.5 L 137.5,181.5" stroke="#4a8b2c" stroke-width="1.2" />
        <path d="M 132,184.5 L 136,184.5 L 136.5,192 L 131.5,192 Z" />
        <!-- Horse body, neck, head, tail & legs -->
        <ellipse cx="134.5" cy="194" rx="8.5" ry="3.8" />
        <!-- Horse neck & head facing right -->
        <polygon points="140,192 144,185 147.5,187.5 145.5,190 142.5,194" />
        <!-- Horse tail -->
        <path d="M 126.5,193 Q 123,195 123.5,200" fill="none" stroke="#4a8b2c" stroke-width="1.8" stroke-linecap="round" />
        <!-- Horse legs -->
        <line x1="128.5" y1="196.5" x2="127" y2="205" stroke="#4a8b2c" stroke-width="1.8" stroke-linecap="round" />
        <line x1="131.5" y1="197" x2="132" y2="205" stroke="#4a8b2c" stroke-width="1.7" stroke-linecap="round" />
        <line x1="138" y1="197" x2="137.5" y2="205" stroke="#4a8b2c" stroke-width="1.7" stroke-linecap="round" />
        <line x1="141" y1="196" x2="143" y2="204.5" stroke="#4a8b2c" stroke-width="1.8" stroke-linecap="round" />
      </g>

      <!-- Quadrant 4: Bottom-Right (Red bg, White Winged Caduceus) -->
      <rect x="150" y="167" width="54" height="63" fill="#a60917" />
      <g transform="translate(172, 193)" stroke="#ffffff" fill="none">
        <!-- Central Caduceus Staff & Top Orb -->
        <line x1="0" y1="-17" x2="0" y2="20" stroke-width="2" stroke-linecap="round" />
        <circle cx="0" cy="-19" r="2.3" fill="#ffffff" stroke="none" />
        <!-- Spread Wings -->
        <path d="M -1,-14 C -8,-20 -16,-18 -19,-13 C -14,-12 -10,-10 -2,-10 Z" fill="#ffffff" stroke="none" />
        <path d="M 1,-14 C 8,-20 16,-18 19,-13 C 14,-12 10,-10 2,-10 Z" fill="#ffffff" stroke="none" />
        <!-- Intertwined Serpents -->
        <path d="M -6,-8 C 7,-4 -7,3 6,8 C -5,12 -3,16 0,18" stroke-width="1.7" stroke-linecap="round" />
        <path d="M 6,-8 C -7,-4 7,3 -6,8 C 5,12 3,16 0,18" stroke-width="1.7" stroke-linecap="round" />
      </g>

      <!-- Shield Interior Divider Lines -->
      <line x1="96" y1="118" x2="204" y2="118" stroke="#112e76" stroke-width="2" />
      <line x1="96" y1="167" x2="204" y2="167" stroke="#112e76" stroke-width="2" />
      <line x1="150" y1="118" x2="150" y2="229" stroke="#112e76" stroke-width="2" />
    </g>

    <!-- Crisp Shield Outer Frame -->
    <path d="M 98,95 L 202,95 L 202,158 C 202,193 177,215 150,228 C 123,215 98,193 98,158 Z" fill="none" stroke="#112e76" stroke-width="2.5" stroke-linejoin="round" />
  </g>
</svg>`;

/**
 * Direct SVG Data URL for crisp rendering inside <img> tags in the UI preview
 */
export const MARICOPA_SEAL_DATA_URL = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
  MARICOPA_SEAL_SVG
)}`;

let cachedSealPngBytes: Uint8Array | null = null;
let cachedSealBase64Png: string | null = null;

function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Renders MARICOPA_SEAL_SVG onto a 300x300 HTML5 Canvas and returns PNG bytes (Uint8Array)
 * suitable for embedding inside Microsoft Word .docx files via docx's ImageRun.
 */
export async function getMaricopaSealPngBytes(size = 300): Promise<Uint8Array> {
  if (cachedSealPngBytes && size === 300) {
    return cachedSealPngBytes;
  }

  if (typeof document === 'undefined') {
    // 1x1 transparent PNG fallback for non-browser environments
    return base64ToUint8Array(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
    );
  }

  return new Promise<Uint8Array>((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(
            base64ToUint8Array(
              'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
            )
          );
          return;
        }

        ctx.clearRect(0, 0, size, size);
        ctx.drawImage(img, 0, 0, size, size);

        const dataUrl = canvas.toDataURL('image/png');
        const base64Part = dataUrl.split(',')[1] || '';
        const bytes = base64ToUint8Array(base64Part);

        if (size === 300) {
          cachedSealBase64Png = base64Part;
          cachedSealPngBytes = bytes;
        }
        resolve(bytes);
      } catch {
        resolve(
          base64ToUint8Array(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
          )
        );
      }
    };

    img.onerror = () => {
      resolve(
        base64ToUint8Array(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
        )
      );
    };

    img.src = MARICOPA_SEAL_DATA_URL;
  });
}

/**
 * Returns base64-encoded PNG string of the rendered 300x300 Maricopa County Seal
 */
export async function getMaricopaSealBase64Png(): Promise<string> {
  if (cachedSealBase64Png) return cachedSealBase64Png;
  const bytes = await getMaricopaSealPngBytes(300);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  cachedSealBase64Png = btoa(binary);
  return cachedSealBase64Png;
}
