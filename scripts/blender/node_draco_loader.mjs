import draco3d from 'draco3d';
import {BufferGeometry,BufferAttribute} from 'three';

// Node adapter for the installed official Draco decoder. Used only in offline
// geometry validation; the browser uses Three's standard DRACOLoader and the
// local, bundled WebAssembly decoder under /museum/draco/.
const decoderModule=draco3d.createDecoderModule({});
export const nodeDracoLoader={
 preload(){return this;},
 async decodeDracoFile(buffer,done,ids,types,_colorSpace,onError){
  let module,decoder,shape;
  try{
   module=await decoderModule;decoder=new module.Decoder();shape=new module.Mesh();
   const bytes=new Int8Array(buffer);const status=decoder.DecodeArrayToMesh(bytes,bytes.length,shape);
   if(!status.ok())throw new Error(status.error_msg());
   const geometry=new BufferGeometry();
   for(const [name,id] of Object.entries(ids)){
    const attr=decoder.GetAttributeByUniqueId(shape,id),Typed=globalThis[types[name]],count=shape.num_points()*attr.num_components();
    const dataType={Float32Array:module.DT_FLOAT32,Int8Array:module.DT_INT8,Uint8Array:module.DT_UINT8,Int16Array:module.DT_INT16,Uint16Array:module.DT_UINT16,Int32Array:module.DT_INT32,Uint32Array:module.DT_UINT32}[types[name]];
    const length=count*Typed.BYTES_PER_ELEMENT,ptr=module._malloc(length);
    try{decoder.GetAttributeDataArrayForAllPoints(shape,attr,dataType,length,ptr);geometry.setAttribute(name,new BufferAttribute(new Typed(module.HEAPU8.buffer,ptr,count).slice(),attr.num_components()));}
    finally{module._free(ptr);}
   }
   const count=shape.num_faces()*3,ptr=module._malloc(count*4);
   try{decoder.GetTrianglesUInt32Array(shape,count*4,ptr);geometry.setIndex(new BufferAttribute(new Uint32Array(module.HEAPU8.buffer,ptr,count).slice(),1));}
   finally{module._free(ptr);}
   done(geometry);
  }catch(error){onError(error);}
  finally{if(shape)module.destroy(shape);if(decoder)module.destroy(decoder);}
 }
};
