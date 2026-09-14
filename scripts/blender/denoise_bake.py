"""Denoise existing HDR atlases using Blender's bundled OpenImageDenoise.
Preserves source EXR, topology, UVs, anchors, and original GLBs.
API: https://www.openimagedenoise.org/documentation.html
"""
import bpy,ctypes as C,json,sys,time,struct,zlib
import numpy as np
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
stem=sys.argv[sys.argv.index('--')+1] if '--' in sys.argv else 'hall'
private=ROOT/'assets/museum/bake-experiments'/stem
out=ROOT/'public/museum/bakes';start=time.time()
bpy.ops.wm.open_mainfile(filepath=str(private/(stem+'-baked.blend')))
report=json.loads((out/(stem+'-report.json')).read_text())
lib=C.CDLL('/Applications/Blender.app/Contents/Resources/lib/libOpenImageDenoise.dylib')
def api(name,result,args):
 f=getattr(lib,name);f.restype=result;f.argtypes=args;return f
new=api('oidnNewDevice',C.c_void_p,[C.c_int]);commit=api('oidnCommitDevice',None,[C.c_void_p])
newfilter=api('oidnNewFilter',C.c_void_p,[C.c_void_p,C.c_char_p])
setimage=api('oidnSetSharedFilterImage',None,[C.c_void_p,C.c_char_p,C.c_void_p,C.c_int,C.c_size_t,C.c_size_t,C.c_size_t,C.c_size_t,C.c_size_t])
setbool=api('oidnSetFilterBool',None,[C.c_void_p,C.c_char_p,C.c_bool]);commitfilter=api('oidnCommitFilter',None,[C.c_void_p]);execute=api('oidnExecuteFilter',None,[C.c_void_p])
error=api('oidnGetDeviceError',C.c_int,[C.c_void_p,C.POINTER(C.c_char_p)])
release=api('oidnReleaseFilter',None,[C.c_void_p]);releasedevice=api('oidnReleaseDevice',None,[C.c_void_p])
device=new(1);commit(device)
for item in report['atlases']:
 group=item['group'];size=item['resolution'];scale=item['radianceScale']
 source=bpy.data.images.load(str(private/(group+'-radiance.exr')),check_existing=False)
 pixels=np.empty(size*size*4,dtype=np.float32);source.pixels.foreach_get(pixels)
 colors=np.ascontiguousarray(pixels.reshape(size,size,4)[:,:,:3]);result=np.empty_like(colors)
 filt=newfilter(device,b'RT')
 setimage(filt,b'color',colors.ctypes.data,3,size,size,0,0,0);setimage(filt,b'output',result.ctypes.data,3,size,size,0,0,0)
 setbool(filt,b'hdr',True);commitfilter(filt);execute(filt)
 message=C.c_char_p();code=error(device,C.byref(message))
 if code:raise RuntimeError(message.value)
 release(filt)
 linear=np.clip(result/scale,0,1)
 srgb=np.where(linear<=.0031308,linear*12.92,1.055*np.power(linear,1/2.4)-.055)
 rgb=np.uint8(np.clip(np.rint(srgb[::-1]*255),0,255))
 def chunk(kind,data):return struct.pack('>I',len(data))+kind+data+struct.pack('>I',zlib.crc32(kind+data)&0xffffffff)
 raw=b''.join(b'\x00'+row.tobytes() for row in rgb)
 path=out/(stem+'-'+group+'.png');path.write_bytes(b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',size,size,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(raw,6))+chunk(b'IEND',b''))
 image=bpy.data.images.load(str(path),check_existing=False);image.colorspace_settings.name='sRGB';image.pack()
 mat=bpy.data.materials['BAKED '+stem+' '+group]
 for node in mat.node_tree.nodes:
  if node.type=='TEX_IMAGE':node.image=image
 samples=[];flat=linear.reshape(-1,3)
 for desired in [.1,.3,.6]:
  index=int(np.argmin(np.abs(flat.mean(axis=1)-desired)));samples.append({'x':index%size,'y':size-1-index//size,'expectedLinear':flat[index].tolist()})
 item['pixelProbes']=samples;item['denoiser']='OpenImageDenoise RT HDR, CPU, no auxiliary guides'
 print('DENOISED',group,time.time()-start,flush=True)
releasedevice(device)
bpy.ops.wm.save_as_mainfile(filepath=str(private/(stem+'-baked.blend')))
target=ROOT/'public/museum'/(stem+'-baked.glb')
bpy.ops.export_scene.gltf(filepath=str(target),export_format='GLB',export_yup=True,export_extras=True,export_cameras=False,export_lights=False,export_image_format='WEBP',export_image_quality=94,export_vertex_color='NONE',export_draco_mesh_compression_enable=True,export_draco_mesh_compression_level=6,export_draco_position_quantization=20,export_draco_normal_quantization=12,export_draco_texcoord_quantization=16)
report['bytes']=target.stat().st_size;report['denoiseSeconds']=time.time()-start;report['positionQuantizationBits']=20
(out/(stem+'-report.json')).write_text(json.dumps(report,indent=2))
print('DENOISE_FINISHED',report['bytes'],report['denoiseSeconds'],flush=True)
