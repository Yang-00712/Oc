// Small, uncompressed ZIP writer for explicit local training exports; no third-party runtime.
export function zipFiles(files){
    if(files.length>6000) throw new Error('匯出項目過多。');
    const encoder=new TextEncoder(),parts=[],directory=[];let offset=0;
    const table=Uint32Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=(n&1)?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
    const crc=bytes=>{let n=0xffffffff;for(const b of bytes)n=table[(n^b)&255]^(n>>>8);return (n^0xffffffff)>>>0;};
    function header(length){const bytes=new Uint8Array(length);return {bytes,view:new DataView(bytes.buffer)};}
    for(const file of files){
        if(!/^[a-zA-Z0-9_./-]+$/.test(file.name)||file.name.includes('..')) throw new Error('匯出檔名無效。');
        const name=encoder.encode(file.name),data=typeof file.data==='string'?encoder.encode(file.data):file.data;
        const checksum=crc(data),local=header(30),central=header(46);
        local.view.setUint32(0,0x04034b50,true);local.view.setUint16(4,20,true);local.view.setUint16(6,0x800,true);
        local.view.setUint32(14,checksum,true);local.view.setUint32(18,data.length,true);local.view.setUint32(22,data.length,true);local.view.setUint16(26,name.length,true);
        central.view.setUint32(0,0x02014b50,true);central.view.setUint16(4,20,true);central.view.setUint16(6,20,true);central.view.setUint16(8,0x800,true);
        central.view.setUint32(16,checksum,true);central.view.setUint32(20,data.length,true);central.view.setUint32(24,data.length,true);central.view.setUint16(28,name.length,true);central.view.setUint32(42,offset,true);
        parts.push(local.bytes,name,data);directory.push(central.bytes,name);offset+=30+name.length+data.length;
    }
    const directoryBytes=directory.reduce((n,b)=>n+b.length,0),end=header(22);
    end.view.setUint32(0,0x06054b50,true);end.view.setUint16(8,files.length,true);end.view.setUint16(10,files.length,true);end.view.setUint32(12,directoryBytes,true);end.view.setUint32(16,offset,true);
    return new Blob([...parts,...directory,end.bytes],{type:'application/zip'});
}
