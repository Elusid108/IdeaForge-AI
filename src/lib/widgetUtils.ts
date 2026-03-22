// Widget data encoding/decoding utilities
// Widgets store JSON in the `description` field: { code, summary, instructions }

export interface WidgetData {
  code: string;
  summary: string;
  instructions: string;
}

export function encodeWidgetData(code: string, summary: string, instructions: string): string {
  return JSON.stringify({ code, summary, instructions });
}

export function parseWidgetData(description: string | null): WidgetData {
  if (!description) return { code: "", summary: "", instructions: "" };
  try {
    const parsed = JSON.parse(description);
    if (parsed && typeof parsed === "object" && "code" in parsed) {
      return {
        code: parsed.code || "",
        summary: parsed.summary || "",
        instructions: parsed.instructions || "",
      };
    }
  } catch {
    // Legacy: raw HTML code stored directly
  }
  return { code: description, summary: "", instructions: "" };
}

// Default widget templates
export const WIDGET_TEMPLATES = {
  unitConverter: {
    title: "Unit Converter",
    summary: "Convert between metric and imperial units for length, weight, and temperature.",
    instructions: "<p><b>How to use:</b></p><ol><li>Select a conversion type from the dropdown (Length, Weight, or Temperature).</li><li>Enter a numeric value in the input field.</li><li>Choose the conversion direction — <b>To Metric</b> or <b>To Imperial</b>.</li><li>The result updates automatically as you type.</li></ol><p><b>Supported conversions:</b></p><ul><li><b>Length:</b> inches ↔ centimeters</li><li><b>Weight:</b> pounds ↔ kilograms</li><li><b>Temperature:</b> °F ↔ °C</li></ul>",
    code: `<!DOCTYPE html><html><head><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:system-ui;background:#1a1a2e;color:#eee;display:flex;justify-content:center;align-items:center;min-height:100vh}.container{background:#16213e;border-radius:12px;padding:24px;width:320px;box-shadow:0 8px 32px rgba(0,0,0,.3)}h2{text-align:center;margin-bottom:16px;color:#0af}select,input{width:100%;padding:10px;margin:6px 0;border:1px solid #333;border-radius:8px;background:#0d1b2a;color:#eee;font-size:14px}.result{margin-top:16px;padding:12px;background:#0d1b2a;border-radius:8px;text-align:center;font-size:18px;color:#0af}</style></head><body><div class="container"><h2>Unit Converter</h2><select id="type" onchange="convert()"><option value="length">Length (in↔cm)</option><option value="weight">Weight (lb↔kg)</option><option value="temp">Temperature (°F↔°C)</option></select><input id="val" type="number" placeholder="Enter value" oninput="convert()"><select id="dir" onchange="convert()"><option value="toMetric">To Metric</option><option value="toImperial">To Imperial</option></select><div class="result" id="result">—</div></div><script>function convert(){const v=parseFloat(document.getElementById('val').value),t=document.getElementById('type').value,d=document.getElementById('dir').value,r=document.getElementById('result');if(isNaN(v)){r.textContent='—';return}let o;if(t==='length')o=d==='toMetric'?v*2.54+' cm':v/2.54+' in';else if(t==='weight')o=d==='toMetric'?(v*.453592).toFixed(2)+' kg':(v*2.20462).toFixed(2)+' lb';else o=d==='toMetric'?((v-32)*5/9).toFixed(1)+' °C':(v*9/5+32).toFixed(1)+' °F';r.textContent=o}</script></body></html>`,
  },
  calculator: {
    title: "Calculator",
    summary: "A standard 10-digit calculator with basic arithmetic operations.",
    instructions: "<p><b>How to use:</b></p><ol><li>Click number buttons (0–9) to enter digits.</li><li>Use operator buttons (<b>+</b>, <b>−</b>, <b>×</b>, <b>÷</b>) for arithmetic.</li><li>Press <b>=</b> to evaluate the expression.</li><li>Use <b>C</b> to clear the display, or <b>⌫</b> to delete the last character.</li><li>Parentheses <b>( )</b> can be used for grouping operations.</li></ol><p><b>Supported operations:</b> Addition, subtraction, multiplication, division, and parenthesized expressions.</p>",
    code: `<!DOCTYPE html><html><head><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:system-ui;background:#1a1a2e;color:#eee;display:flex;justify-content:center;align-items:center;min-height:100vh}.calc{background:#16213e;border-radius:16px;padding:20px;width:280px;box-shadow:0 8px 32px rgba(0,0,0,.3)}.display{background:#0d1b2a;border-radius:10px;padding:16px;text-align:right;font-size:28px;margin-bottom:12px;min-height:60px;word-break:break-all;color:#0af}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}button{padding:14px;border:none;border-radius:10px;font-size:16px;cursor:pointer;transition:background .15s}button{background:#0d1b2a;color:#eee}button:hover{background:#1a3a5c}button.op{background:#0a4a7a;color:#0af}button.op:hover{background:#0c5a9a}button.eq{background:#0af;color:#000;font-weight:bold}button.eq:hover{background:#08d}button.clear{background:#e74c3c;color:#fff}button.clear:hover{background:#c0392b}</style></head><body><div class="calc"><div class="display" id="display">0</div><div class="grid"><button class="clear" onclick="c()">C</button><button onclick="d('(')">(</button><button onclick="d(')')">)</button><button class="op" onclick="d('/')">÷</button><button onclick="d('7')">7</button><button onclick="d('8')">8</button><button onclick="d('9')">9</button><button class="op" onclick="d('*')">×</button><button onclick="d('4')">4</button><button onclick="d('5')">5</button><button onclick="d('6')">6</button><button class="op" onclick="d('-')">−</button><button onclick="d('1')">1</button><button onclick="d('2')">2</button><button onclick="d('3')">3</button><button class="op" onclick="d('+')">+</button><button onclick="d('0')">0</button><button onclick="d('.')">.</button><button onclick="del()">⌫</button><button class="eq" onclick="eq()">=</button></div></div><script>let s='0';function up(){document.getElementById('display').textContent=s}function d(v){s=s==='0'&&v!=='.'?v:s+v;up()}function c(){s='0';up()}function del(){s=s.length>1?s.slice(0,-1):'0';up()}function eq(){try{s=String(eval(s))}catch{s='Error'}up()}document.addEventListener('keydown',function(e){var k=e.key;if('0123456789.'.includes(k)){d(k);e.preventDefault()}else if(k==='+'){d('+');e.preventDefault()}else if(k==='-'){d('-');e.preventDefault()}else if(k==='*'){d('*');e.preventDefault()}else if(k==='/'){d('/');e.preventDefault()}else if(k==='('||k===')'){d(k);e.preventDefault()}else if(k==='Enter'||k==='='){eq();e.preventDefault()}else if(k==='Backspace'){del();e.preventDefault()}else if(k==='Escape'||k==='c'||k==='C'){c();e.preventDefault()}})</script></body></html>`,
  },
};
