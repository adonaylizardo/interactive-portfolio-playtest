# Hoja de QA hostil · frame C + JAC T9 exterior (BORRADOR). Sin fotos: la comparación es contra los sprites iso T9 v3.
import json, os, sys, math, numpy as np
from PIL import Image, ImageDraw, ImageFont
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
import build_primera_persona as B, build_v2 as BV, v2_t9ext as T, build_frame_c as FC
OUT=B.OUT; PZ=f'{OUT}/piezas'; FR=f'{OUT}/frames'; DST='/workspace/portfolio/qa/primera-persona/frame-c-t9.png'
ISO='/workspace/portfolio/forge-paquete/relleno/jac-t9/v3/'
fnt=lambda s: ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',s)
mono=lambda s: ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf',s)
BG=(11,12,14); NEU=(64,66,72); TX=(237,238,240); T2=(150,155,164); OK=(120,200,140); BAD=(230,90,90); CY=(80,170,255); MG=(255,80,200)
R=json.load(open(f'{OUT}/src/frame-c.json')); SW=2640
def checker(w,h,s=8):
    a=np.zeros((h,w,3),np.uint8)+np.array([52,54,60],np.uint8); yy,xx=np.mgrid[0:h,0:w]; a[((yy//s+xx//s)%2)==1]=(74,76,84); return Image.fromarray(a).convert('RGBA')
def halo(nm,fn,dm,l,D):
    im1=Image.open(f'{PZ}/{nm}@1x.png').convert('RGBA'); w,h=im1.size
    s4=Image.new('RGBA',(w*B.K*(D//16 if D==16 else 1)*0+w*B.K,h*B.K),(0,0,0,0))
    if D!=T.D_NEAR: return None
    pn=B.Pn(s4,-dm['u0']*D*B.K,(h-1)*B.K,D*B.K); fn(pn,l)
    a1=np.asarray(im1).astype(float); a4=np.asarray(s4).astype(float)[:h*4,:w*4].reshape(h,4,w,4,4).transpose(0,2,1,3,4).reshape(h,w,16,4)
    lum4=a4[...,:3]@np.array([0.3,0.59,0.11]); mn=np.where(a4[...,3]>0,lum4,1e9).min(-1)
    lum1=a1[...,:3]@np.array([0.3,0.59,0.11]); part=(a1[...,3]>0)&(a1[...,3]<255)
    return int(part.sum()), round(100*(part&(lum1<mn-3)).sum()/max(1,part.sum()),2)
secs=[]
def sec(h): im=Image.new('RGBA',(SW,h),BG+(255,)); secs.append(im); return im,ImageDraw.Draw(im)
s,d=sec(110)
d.text((30,18),'Primera persona · frame C (a pie junto a la JAC T9) · BORRADOR · QA hostil · ojo 1,78 m · FOV 70° · horizonte y=360',font=fnt(30),fill=TX)
d.text((30,62),'Camioneta: pieza "cerca" a 192 px/m (escala 1:1 a z = 4,76 m) + LOD a 16 px/m. Sin fotos en la hoja; comparación contra los sprites iso T9 v3 (BORRADOR).',font=fnt(20),fill=T2)
Cf=Image.open(f'{FR}/frame-c-a-pie-junto-t9@1x.png').convert('RGBA'); Cl=Image.open(f'{OUT}/src/_qa_frame-c-luces.png').convert('RGBA')
s,d=sec(800)
d.text((30,10),f"(c) frame C · T9 apagada, estacionada · ámbar {R['frame-c-a-pie-junto-t9']} %",font=fnt(22),fill=TX); s.alpha_composite(Cf,(30,46))
d.text((1340,10),f"(c) variante solo QA · T9 con luces (DRL + faros + pilotos + haz) · ámbar {R['frame-c__t9-luces (solo QA)']} %",font=fnt(22),fill=TX); s.alpha_composite(Cl,(1340,46))
# escala
s,d=sec(800)
o=Cf.copy(); lay=Image.new('RGBA',o.size,(0,0,0,0)); g=ImageDraw.Draw(lay); cam=B.Cam(0,1.78); z=FC.Z_T9
g.line([(0,360),(1280,360)],fill=CY+(255,),width=1)
for xw in (FC.X_T9+2.9, FC.X_T9-2.9):
    a=cam.P(xw,0,z); b=cam.P(xw,1.78,z); g.line([(a[0]/4,a[1]/4),(b[0]/4,b[1]/4)],fill=MG+(255,),width=3)
# silueta de Adonay (1,78 m) junto a la puerta, en el plano del lado de la T9
ax=cam.P(FC.X_T9+0.4,0,z); top=cam.P(FC.X_T9+0.4,1.78,z); hpx=(ax[1]-top[1])/4
cx=ax[0]/4; yb=ax[1]/4
g.ellipse([cx-hpx*0.065,yb-hpx,cx+hpx*0.065,yb-hpx*0.87],outline=OK+(255,),width=2)
g.rectangle([cx-hpx*0.12,yb-hpx*0.86,cx+hpx*0.12,yb-hpx*0.47],outline=OK+(255,),width=2)
g.rectangle([cx-hpx*0.10,yb-hpx*0.47,cx+hpx*0.10,yb],outline=OK+(255,),width=2)
for v,lab in ((1.84,'techo 1,84 m'),(1.17,'borde del platón 1,17 m'),(0.80,'rueda Ø 0,80 m')):
    p=cam.P(FC.X_T9+2.75,v,z); g.line([(p[0]/4,p[1]/4),(p[0]/4+60,p[1]/4)],fill=(255,210,80,255),width=1)
o.alpha_composite(lay); s.alpha_composite(o,(30,46))
d.text((30,10),'Escala: cian = horizonte (altura del ojo, 1,78 m) · magenta = postes de 1,78 m en el plano de la T9: su punta toca el horizonte · verde = Adonay 1,78 m junto a la puerta',font=fnt(20),fill=TX)
e=R['escala']
d.multiline_text((1340,60),f"z del lado de la T9 = {e['z_lado_m']} m → {e['px_por_m']} px/m\nlargo 5,33 m = {e['largo_px']} px\ntecho 1,84 m → y = {e['techo_y']} (6 cm sobre el ojo: el techo y el\n    techo solar quedan de canto, no se ven desde 1,78 m)\nsuelo → y = {e['suelo_y']} (dentro del cuadro de 720)\nlo que se ve encima de la T9: solo lo que está más alto que 1,84 m\n\nVeredicto de escala: OK. La camioneta mide 1,03× a Adonay de alto,\ny la pared lateral llena 80 % del ancho a 4,76 m, como debe\npasar al bajarse y mirar al otro lado de la calle.",font=fnt(20),fill=TX,spacing=8)
# piezas sobre damero
s,d=sec(60); d.text((30,14),'Piezas jac-t9-ext @1x sobre damero (192 px/m) · apagado | luces · ancla = pie del eje central (magenta)',font=fnt(24),fill=TX)
rows=[]
for k,(fn,dm) in T.T9EXT.items():
    ims=[Image.open(f"{PZ}/jac-t9-ext__{k}__{v}@1x.png").convert('RGBA') for v in ('apagado','luces')]
    h=ims[0].height+80; s,d=sec(h); x=30
    for v,im in zip(('apagado','luces'),ims):
        c=checker(im.width,im.height); c.alpha_composite(im); nm=f'jac-t9-ext__{k}__{v}'; an=R['piezas'][nm]['ancla']
        gg=ImageDraw.Draw(c); gg.line([(an[0]-10,an[1]),(an[0]+10,an[1])],fill=MG+(255,)); gg.line([(an[0],an[1]-10),(an[0],an[1])],fill=MG+(255,))
        s.alpha_composite(c,(x,60)); hv=halo(nm,fn,dm,v=='luces',T.D_NEAR); rows.append((nm,im.width,im.height,R['piezas'][nm]['ambar_pct'],hv))
        d.multiline_text((x,2),f"{nm}\n{im.width}×{im.height} @1x · {im.width*2}×{im.height*2} @2x · {round(im.width/192,2)}×{round((im.height-2)/192,2)} m\nancla {an} · ámbar {R['piezas'][nm]['ambar_pct']} % · halo {hv[1]} %",font=fnt(15),fill=TX,spacing=2)
        x+=max(im.width,420)+40
    # LOD a 1x y ×4
    lod=Image.open(f"{PZ}/jac-t9-ext__{k}__apagado__lod16@1x.png").convert('RGBA'); z4=lod.resize((lod.width*4,lod.height*4),Image.NEAREST)
    c=checker(z4.width,z4.height); c.alpha_composite(z4); s.alpha_composite(lod,(x,60)); s.alpha_composite(c,(x+lod.width+10,60))
    d.text((x,h-18),f"LOD 16 px/m {lod.width}×{lod.height} (1x y ×4)",font=fnt(14),fill=T2)
# zoom y comparación con iso
s,d=sec(560); s.paste(NEU+(255,),(20,40,SW-20,550))
d.text((30,8),'¿Se lee como la T9 y no como una pick-up genérica? Recortes ×2 del frame C y del frente/trasera, junto a los sprites iso T9 v3 (BORRADOR)',font=fnt(20),fill=TX)
x=30
for box,lab in (((870,440,1060,640),'nariz'),((30,330,300,490),'barra JAC + lona')):
    c=Cf.crop(box); z2=c.resize((c.width*2,c.height*2),Image.NEAREST); s.alpha_composite(z2,(x,70)); d.text((x,46),lab+' (×2)',font=fnt(15),fill=T2); x+=z2.width+20
fr=Image.open(f'{PZ}/jac-t9-ext__frente__apagado@1x.png').convert('RGBA').crop((80,140,370,320)); fr=fr.resize((fr.width*2,fr.height*2),Image.NEAREST)
cc=checker(fr.width,fr.height); cc.alpha_composite(fr); s.alpha_composite(cc,(x,70)); d.text((x,46),'frente: parrilla alta plana + JAC (×2)',font=fnt(15),fill=T2); x+=fr.width+20
for f in ('jac-t9-v3__apagado_se@1x.png','jac-t9-v3__apagado_ne@1x.png'):
    if os.path.exists(ISO+f):
        im=Image.open(ISO+f).convert('RGBA'); im=im.resize((im.width*2,im.height*2),Image.NEAREST).crop((60,0,500,384)); s.alpha_composite(im,(x,60)); x+=im.width-40
# tabla
for nm in R['piezas']:
    if 'lod16' in nm: rows.append((nm,R['piezas'][nm]['w'],R['piezas'][nm]['h'],R['piezas'][nm]['ambar_pct'],(0,0.0)))
rows.append(('frame-c-a-pie-junto-t9',1280,720,R['frame-c-a-pie-junto-t9'],(0,0.0)))
s,d=sec(70+24*len(rows))
d.text((30,10),'Ámbar (r>90, r−b>55, g>b, r≥g · alfa>20 · tope 5 %) y halo de borde (debe ser 0; en LOD no aplica la prueba de bloque)',font=fnt(20),fill=TX)
for i,(nm,w,h,am,hv) in enumerate(rows):
    hv=hv or (0,0.0); okc=OK if am<=5 and hv[1]==0 else BAD
    d.text((30,50+i*24),f"{nm:<44} {w:>5}×{h:<4} ámbar {am:>5.2f}%   borde {hv[0]:>5}px halo {hv[1]:>4.1f}%",font=mono(16),fill=okc)
S=Image.new('RGB',(SW,sum(x.height for x in secs)),BG); y=0
for x in secs: S.paste(x.convert('RGB'),(0,y)); y+=x.height
S.save(DST); print(DST,S.size); print(rows)
