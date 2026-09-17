// Minimal inference for one explicitly supported architecture; not a general ONNX runtime.
const SHAPES = { 'conv1.weight': [8,1,5,5], 'conv1.bias': [8], 'conv2.weight': [16,8,5,5], 'conv2.bias': [16], 'fc.weight': [10,256], 'fc.bias': [10] };
export function loadModel(doc) {
    if (doc?.schema !== 1 || doc.architecture !== 'conv8x5-pool2-conv16x5-pool2-fc10') throw new Error('不支援的模型格式。');
    const weights = {};
    for (const [name, shape] of Object.entries(SHAPES)) {
        const item = doc.weights?.[name];
        if (JSON.stringify(item?.shape) !== JSON.stringify(shape) || !Array.isArray(item?.data) || item.data.length !== shape.reduce((a,b)=>a*b,1) || item.data.some(n=>!Number.isFinite(n) || Math.abs(n)>1000)) throw new Error(`模型參數無效：${name}`);
        weights[name] = Float32Array.from(item.data);
    }
    return weights;
}
function convPool(input, size, inChannels, outChannels, weights, bias) {
    const convSize = size - 4, pooled = convSize / 2;
    const output = new Float32Array(outChannels * pooled * pooled);
    for (let oc=0; oc<outChannels; oc++) for (let py=0; py<pooled; py++) for (let px=0; px<pooled; px++) {
        let maximum = 0;
        for (let dy=0; dy<2; dy++) for (let dx=0; dx<2; dx++) {
            let sum = bias[oc];
            const y=py*2+dy, x=px*2+dx;
            for (let ic=0; ic<inChannels; ic++) for (let ky=0; ky<5; ky++) {
                const ii=ic*size*size+(y+ky)*size+x, wi=(oc*inChannels+ic)*25+ky*5;
                for (let kx=0; kx<5; kx++) sum += input[ii+kx] * weights[wi+kx];
            }
            if (sum>maximum) maximum=sum;
        }
        output[oc*pooled*pooled+py*pooled+px]=maximum;
    }
    return output;
}
export function infer(pixels, w) {
    if (pixels.length !== 784) throw new Error('數字影像須為 28×28。');
    const input = Float32Array.from(pixels, n => n/255);
    const a = convPool(input,28,1,8,w['conv1.weight'],w['conv1.bias']);
    const b = convPool(a,12,8,16,w['conv2.weight'],w['conv2.bias']);
    const logits = Array.from({length:10}, (_,c) => {
        let v=w['fc.bias'][c];
        for(let i=0;i<256;i++) v+=b[i]*w['fc.weight'][c*256+i];
        return v;
    });
    const max=Math.max(...logits), exp=logits.map(v=>Math.exp(v-max)), total=exp.reduce((a,b)=>a+b,0);
    const candidates=exp.map((v,digit)=>({digit,score:v/total})).sort((a,b)=>b.score-a.score);
    return { digit:candidates[0].digit, score:candidates[0].score, margin:candidates[0].score-candidates[1].score, candidates:candidates.slice(0,3), logits };
}
