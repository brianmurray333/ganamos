/**
 * Mock QR Server Store
 * Generates deterministic SVG QR codes for development/testing
 * Eliminates external dependency on api.qrserver.com
 */

interface QRCodeRecord {
  id: number;
  data: string;
  size: string;
  svg: string;
  generatedAt: Date;
}

class MockQRServerStore {
  private qrCodes: Map<string, QRCodeRecord> = new Map();
  private qrCounter = 1;

  /**
   * Generate a deterministic SVG QR code
   * Uses a simple hash of the data to create a consistent pattern
   */
  generateQrCode(data: string, size: string = "200x200"): string {
    const key = `${data}-${size}`;
    
    // Return cached version if exists (deterministic)
    if (this.qrCodes.has(key)) {
      const cached = this.qrCodes.get(key)!;
      console.log(`[Mock QR Server] Returning cached QR code for data length: ${data.length}`);
      return cached.svg;
    }

    const svg = this.createDeterministicSvg(data, size);
    
    // Store for determinism
    this.qrCodes.set(key, {
      id: this.qrCounter++,
      data: data.substring(0, 100), // Store truncated for memory
      size,
      svg,
      generatedAt: new Date(),
    });

    console.log(`[Mock QR Server] Generated QR code #${this.qrCounter - 1}`);
    console.log(`[Mock QR Server] Data length: ${data.length} chars`);
    console.log(`[Mock QR Server] Size: ${size}`);

    return svg;
  }

  /**
   * Create a deterministic SVG based on data hash
   */
  private createDeterministicSvg(data: string, size: string): string {
    const [width, height] = size.split('x').map(Number);
    const hash = this.hashString(data);
    
    // Generate deterministic pattern based on hash
    const gridSize = 10;
    const cellSize = Math.floor(width / gridSize);
    
    let cells = '';
    for (let y = 0; y < gridSize; y++) {
      for (let x = 0; x < gridSize; x++) {
        // Use hash to deterministically decide if cell is filled
        const cellHash = (hash + x * 7 + y * 13) % 100;
        const isFilled = cellHash > 50;
        
        // Skip corner markers area
        const isCorner = (x < 3 && y < 3) || (x > 6 && y < 3) || (x < 3 && y > 6);
        
        if (isFilled && !isCorner) {
          cells += `<rect x="${x * cellSize}" y="${y * cellSize}" width="${cellSize}" height="${cellSize}" fill="black"/>`;
        }
      }
    }

    // Add corner markers (standard QR code feature)
    const cornerMarker = (x: number, y: number) => `
      <rect x="${x * cellSize}" y="${y * cellSize}" width="${cellSize * 3}" height="${cellSize * 3}" fill="black"/>
      <rect x="${(x + 1) * cellSize}" y="${(y + 1) * cellSize}" width="${cellSize}" height="${cellSize}" fill="white"/>
    `;

    const corners = cornerMarker(0, 0) + cornerMarker(7, 0) + cornerMarker(0, 7);

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="white"/>
  ${corners}
  ${cells}
  <text x="${width / 2}" y="${height - 10}" text-anchor="middle" font-family="Arial" font-size="12" fill="gray" opacity="0.5">MOCK</text>
</svg>`;
  }

  /**
   * Simple hash function for deterministic pattern generation
   */
  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  /**
   * Get all generated QR codes (for debugging)
   */
  getAllQrCodes(): QRCodeRecord[] {
    return Array.from(this.qrCodes.values());
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      totalGenerated: this.qrCounter - 1,
      cached: this.qrCodes.size,
    };
  }

  /**
   * Clear all cached QR codes (for testing)
   */
  reset(): void {
    this.qrCodes.clear();
    this.qrCounter = 1;
    console.log('[Mock QR Server] Store reset');
  }
}

// Singleton instance with hot reload support
const globalForQrServer = globalThis as unknown as {
  mockQrStore?: MockQRServerStore;
};

export const mockQrStore =
  globalForQrServer.mockQrStore ?? new MockQRServerStore();

if (process.env.NODE_ENV !== 'production') {
  globalForQrServer.mockQrStore = mockQrStore;
}