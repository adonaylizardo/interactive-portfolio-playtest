# Hoja de QA hostil · frame C v3 (TERCERA PERSONA) · T9 re-proyectada desde v3 · Adonay de espaldas · BORRADOR
import json, os, sys, math, numpy as np
from PIL import Image, ImageDraw, ImageFont
HERE=os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0,HERE); sys.path.insert(0,f'{HERE}/t9v3')
import build_primera_persona as B, build_frame_c3 as F3, v2_adonay_espalda as AD, v2_pantone_espalda as PTN
from modelo import iso, FACES
OUT=B.OUT; PZ=f'{OUT}/piezas'; FR=f'{OUT}/frames'; DST='/workspace/portfolio/qa/primera-persona/frame-c-t9.png'
ADP='/workspace/portfolio/forge-paquete/personaje/adonay/'
fnt=lambda s: ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',s)
BG=(11,12,14); NEU=(64,66,72); TX=(237,238,240); T2=(150,155,164); OK=(120,200,140); BAD=(230,90,90); CY=(80,170,255); MG=(255,80,200)
R=json.load(open(f'{OUT}/src/frame-c.json')); SW=2640; CA=R['camara']
def checker(w,h,s=8):
    a=np.zeros((h,w,3),np.uint8)+np.array([52,54,60],np.uint8); yy,xx=np.mgrid[0:h,0:w]; a[((yy//s+xx//s)%2)==1]=(74,76,84); return Image.fromarray(a).convert('RGBA')
def on(bgc,im): c=Image.new('RGBA',im.size,bgc+(255,)) if isinstance(bgc,tuple) else checker(*im.size); c.alpha_composite(im); return c
def bordes(im):
    """píxeles de alfa parcial · % más oscuros que el opaco vecino más oscuro − 6 (halo) · residuos magenta"""
    a=np.asarray(im).astype(float); al=a[...,3]; lum=a[...,:3]@np.array([0.3,0.59,0.11])
    part=(al>0)&(al<255); op=np.where(al==255,lum,1e9)
    mn=np.full(lum.shape,1e9)
    for dy in (-1,0,1):
        for dx in (-1,0,1): mn=np.minimum(mn,np.roll(np.roll(op,dy,0),dx,1))
    halo=part&(mn<1e8)&(lum<mn-6)
    mag=(al>0)&(a[...,0]>a[...,1]+28)&(a[...,2]>a[...,1]+14)
    return int(part.sum()), round(100*halo.sum()/max(1,part.sum()),2), int(mag.sum())
secs=[]
def sec(h): im=Image.new('RGBA',(SW,h),BG+(255,)); secs.append(im); return im,ImageDraw.Draw(im)
s,d=sec(120)
d.text((30,16),'Frame C v3 · TERCERA PERSONA over-the-shoulder · BORRADOR · QA hostil',font=fnt(32),fill=TX)
d.text((30,62),f"Cámara {CA['alto_m']} m de alto, {CA['detras_m']} m detrás de los pies de Adonay, nivelada, FOV 70° (f=914), horizonte y={CA['horizonte_y']} por desplazamiento de eje óptico. Adonay fijo abajo-centro; el mundo se proyecta desde detrás de él.",font=fnt(20),fill=T2)
d.text((30,90),'La T9 NO está redibujada: son los píxeles del render v3 aprobado re-proyectados cara por cara con homografías exactas. Adonay de espaldas pintado con la paleta exacta de sus sprites del mapa.',font=fnt(20),fill=T2)
Cf=Image.open(f'{FR}/frame-c-a-pie-junto-t9@1x.png').convert('RGBA')
s,d=sec(800)
d.text((30,8),f"(c) frame C · ámbar {R['frame-c-a-pie-junto-t9']} % (tope 5 %)",font=fnt(22),fill=TX); s.alpha_composite(Cf,(30,44))
# escala sobre el frame
o=Cf.copy(); g=ImageDraw.Draw(o); cam=F3.cam3(); P=lambda x,y,z: (cam.P(x,y,z)[0]/4,cam.P(x,y,z)[1]/4)
g.line([(0,CA['horizonte_y']),(1280,CA['horizonte_y'])],fill=CY,width=1)
for (x,z,h,c,t) in ((F3.X_AD+0.5,F3.Z_AD,1.78,MG,'1,78'),(F3.XS_T9-0.1,F3.ZF_T9,1.84,OK,'1,84 T9'),(F3.XS_T9-0.1,F3.ZF_T9,1.78,MG,'1,78')):
    a=P(x,0,z); b=P(x,h,z); g.line([a,b],fill=c,width=2); g.text((b[0]+4,b[1]-6),t,font=fnt(13),fill=c)
px_,pz_=F3.X_AD+F3.PT_DX-0.32,F3.Z_AD+F3.PT_DZ; a=P(px_,0,pz_); b=P(px_,0.754,pz_); g.line([a,b],fill=CY,width=2); g.text((a[0]-44,b[1]-14),'0,75',font=fnt(13),fill=CY)
a=P(F3.XS_T9,0,F3.ZF_T9); b=P(F3.XS_T9+1.96,0,F3.ZF_T9); g.line([a,b],fill=OK,width=2); g.text((a[0],a[1]+4),'1,96 m',font=fnt(13),fill=OK)
d.text((1340,8),'(c) escala: 1,78 m (magenta), 1,84 m techo T9 (verde), 0,75 m orejas de Pantone (cian corto); horizonte (cian) = 2,80 m',font=fnt(18),fill=TX)
s.alpha_composite(o,(1340,44))
# T9: fuente iso v3 · mallado de caras · resultado
s,d=sec(660)
src=Image.open('/workspace/jac3/se.jpg').convert('RGBA'); wire=src.copy(); g=ImageDraw.Draw(wire)
cols={'lado':CY,'frente':(255,230,0),'capo':(0,230,0),'parabrisas':(255,140,0),'techo':MG,'lona':(255,255,255)}
for k,f in FACES.items():
    p=[tuple(iso(*q)) for q in f]; g.line(p+[p[0]],fill=cols[k],width=2)
bb=(230,40,1040,630)
d.text((30,8),'T9 fuente: render iso v3 (jac3/se.jpg)',font=fnt(20),fill=TX); s.alpha_composite(src.crop(bb).resize((540,393)),(30,40))
d.text((600,8),'mallado de caras re-proyectadas',font=fnt(20),fill=TX); s.alpha_composite(wire.crop(bb).resize((540,393)),(600,40))
t9=Image.open(f'{PZ}/jac-t9-ext__34-frontal-3p__apagado@1x.png').convert('RGBA')
d.text((1170,8),'pieza 3/4 @1x (sin tinte) · neutro / damero / tinte noche',font=fnt(20),fill=TX)
s.alpha_composite(on(NEU,t9),(1170,40)); s.alpha_composite(on(None,t9),(1170+t9.width+14,40))
a=np.asarray(t9).astype(float); a[...,:3]*=F3.NOCHE; tn=Image.fromarray(a.clip(0,255).astype(np.uint8),'RGBA')
s.alpha_composite(on((24,25,30),tn),(1170+2*(t9.width+14),40))
z2=on(NEU,t9).resize((t9.width*3,t9.height*3),Image.NEAREST).crop((330,300,810,640))
d.text((1170,t9.height+50),'zoom ×3: parrilla JAC, luces partidas, capó',font=fnt(16),fill=TX); s.alpha_composite(z2,(1170,t9.height+72))
pt,hp,mg=bordes(t9)
L=["Rasgos del v3 conservados: nariz corta redondeada; tira LED fina arriba +",
   "bloque de faros abajo en la esquina; parrilla alta y plana de panal con JAC;",
   "barras de techo, lona negra, rines oscuros, gris grafito.",
   f"Bordes: {pt} px de alfa parcial (borde binario) · halo {hp} % · magenta {mg} px",
   f"Ámbar {R['piezas']['jac-t9-ext__34-frontal-3p__apagado']['ambar_pct']} % · sombra de contacto suave, sin losa negra."]
for i,t_ in enumerate(L): d.text((30,450+i*26),t_,font=fnt(18),fill=(OK if hp<1 and mg==0 else BAD) if i==3 else T2)
# Adonay
s,d=sec(760)
d.text((30,8),'Adonay de espaldas · arte 96×150 → @1x ×2 (192×300) · ancla pies-centro (96, 296) · paleta exacta del sprite del mapa',font=fnt(20),fill=TX)
ref=[Image.open(f'{ADP}adonay__{n}@2x.png').convert('RGBA').crop((0,0,64,100)) for n in ('idle_ne','idle_nw','idle_se')]
x=30
for r_,n in zip(ref,('mapa idle_ne','mapa idle_nw','mapa idle_se')):
    big=r_.resize((192,300),Image.NEAREST); s.alpha_composite(on(NEU,big),(x,50)); d.text((x,356),n,font=fnt(16),fill=T2); x+=206
x+=30
idle=Image.open(f'{PZ}/adonay-espalda__idle@1x.png').convert('RGBA'); walk=Image.open(f'{PZ}/adonay-espalda__walk@1x.png').convert('RGBA')
for i in range(2):
    fr=idle.crop((i*192,0,i*192+192,300)); s.alpha_composite(on(NEU,fr),(x,50)); d.text((x,356),f'idle {i}',font=fnt(16),fill=TX); x+=206
for i in range(4):
    fr=walk.crop((i*192,0,i*192+192,300)); s.alpha_composite(on(None,fr),(x,50)); d.text((x,356),f'walk {i} (damero)',font=fnt(16),fill=TX); x+=206
g=ImageDraw.Draw(s); g.line([(30,50+296),(x,50+296)],fill=CY,width=1); g.text((x-140,50+300),'línea de pies',font=fnt(14),fill=CY)
zz=Image.open(f'{FR}/frame-c-a-pie-junto-t9@1x.png').convert('RGBA').crop((520,400,760,720)).resize((480,640),Image.NEAREST)
pt2,hp2,_=bordes(idle)
d.text((30,390),'Chequeos: pelo rizado oscuro (sin barba visible de espaldas salvo patillas), sobrecamisa arena con canesú y tablón, mangas remangadas,',font=fnt(18),fill=T2)
d.text((30,416),f"pulsera roja (muñeca izq.), culotte negro ancho, Converse mostaza suela blanca. Alfa: {pt2} px parciales (NEAREST, binario) · halo {hp2} %.",font=fnt(18),fill=OK if pt2==0 else BAD)
d.text((30,442),f"Ámbar del sprite suelto: {R['piezas']['adonay-espalda']['ambar_pct']} % → es ROPA (arena/mostaza del sprite aprobado), no luz; con el tinte nocturno del frame no cuenta.",font=fnt(18),fill=(230,190,90))
d.text((30,468),f"Escala: {CA['adonay']['alto_px']} px = 1,78 m a {CA['detras_m']} m (2 px @1x por px de arte, entero) · pies y={CA['adonay']['pies_y']} · cabeza y={CA['adonay']['cabeza_y']}",font=fnt(18),fill=T2)
d.text((1900,8),'en el frame (zoom ×2)',font=fnt(18),fill=TX); s.alpha_composite(zz,(1900,40))
# Pantone
s,d=sec(560)
PP='/workspace/portfolio/forge-paquete/personaje/pantone/'
d.text((30,8),'Pantone de espaldas · arte 44×66 → @1x ×2 (88×132 por frame) · ancla pies-centro (44, 128) · misma densidad que adonay-espalda · paleta exacta del mapa',font=fnt(20),fill=TX)
x=30
for n,lab in (('idle_ne','mapa idle_ne'),('sentado_ne','mapa sentado_ne'),('trot_ne','mapa trot_ne f0')):
    r_=Image.open(f'{PP}pantone__{n}@1x.png').convert('RGBA').crop((0,0,26,22)).resize((26*6,22*6),Image.NEAREST)
    s.alpha_composite(on(NEU,r_),(x,60)); d.text((x,60+22*6+6),lab,font=fnt(15),fill=T2); x+=26*6+16
x+=20
for nm,n in (('idle',2),('walk',4),('sit',1)):
    st=Image.open(f'{PZ}/pantone-espalda__{nm}@1x.png').convert('RGBA')
    for i in range(n):
        fr=st.crop((i*88,0,i*88+88,132)); s.alpha_composite(on(NEU if i%2==0 else None,fr),(x,50)); d.text((x,188),f'{nm} {i}',font=fnt(15),fill=TX); x+=100
zz=Image.open(f'{FR}/frame-c-a-pie-junto-t9@1x.png').convert('RGBA').crop((430,520,560,700)).resize((390,540),Image.NEAREST)
zs=Image.open(f'{OUT}/src/_qa_frame-c3-pantone-sentado.png').convert('RGBA').crop((430,520,560,700)).resize((390,540),Image.NEAREST)
st=Image.open(f'{PZ}/pantone-espalda__walk@1x.png').convert('RGBA'); pt3,hp3,_=bordes(st)
PC=R['camara']['pantone']
L=[f"Escala: orejas a {PC['alto_orejas_m']} m (61 filas de arte; en el mapa 21/48 del alto de Adonay = 0,44 → aquí 61/144 = 0,42). Husky mediano: cruz ≈ 0,5 m.",
   f"Posición: {abs(PC['dx_m'])} m a la izquierda y {PC['dz_m']} m por delante de Adonay (0,87 m) · pies en pantalla {PC['pies_pantalla_1x']} · offset vs pies de Adonay {PC['offset_pies_vs_adonay_1x']} px @1x · scale Pixi {PC['escala_pixi']}.",
   "Rasgos del mapa conservados: manto gris en lomo y ancas, gorro oscuro con raya, mejillas blancas, orejas en punta, collar rojo, patas blancas con sombra gris, cola enroscada.",
   f"Alfa: {pt3} px parciales (NEAREST) · halo {hp3} % · ámbar {R['piezas']['pantone-espalda']['ambar_pct']} % (pelo blanco/gris y collar rojo no cuentan como ámbar).",
   "Comportamiento: sigue al jugador con offset fijo; walk cuando Adonay camina; idle al parar; sit tras ~30 s sin input (misma regla que el mapa)."]
for i,t_ in enumerate(L): d.text((30,250+i*28),t_,font=fnt(17),fill=(OK if pt3==0 else BAD) if i==3 else T2)
d.text((1830,8),'en el frame: idle · sentado (QA)',font=fnt(17),fill=TX); s.alpha_composite(zz,(1830-400,0+40)) if False else None
s.alpha_composite(zz.resize((260,360),Image.NEAREST),(1830,40)); s.alpha_composite(zs.resize((260,360),Image.NEAREST),(2110,40))
# tabla
s,d=sec(370)
FL=[('frame-c-a-pie-junto-t9 (@1x)',R['frame-c-a-pie-junto-t9'],'luz: faroles + ventanas'),
    ('jac-t9-ext__34-frontal-3p__apagado',R['piezas']['jac-t9-ext__34-frontal-3p__apagado']['ambar_pct'],'apagada'),
    ('adonay-espalda (idle/walk)',R['piezas']['adonay-espalda']['ambar_pct'],'ropa, no luz (ver nota)'),
    ('pantone-espalda (idle/walk/sit)',R['piezas']['pantone-espalda']['ambar_pct'],'pelo/collar, no luz')]
d.text((30,10),'Ámbar (regla del paquete: r>90, r−b>55, g>b, r≥g · tope 5 % por imagen de escena)',font=fnt(22),fill=TX)
for i,(n,v,nt) in enumerate(FL):
    c=OK if v<=5 else ((230,190,90) if 'ropa' in nt else BAD)
    d.text((30,52+i*34),f'{n:42s} {v:6.2f} %   {nt}',font=fnt(20),fill=c)
d.text((30,206),'Debilidades conocidas: (1) la pieza T9 3/4 vale para ESTA pose cámara↔camioneta (es re-proyección, no 3D); otras distancias = escalar ≈ 8,2/z con error de perspectiva.',font=fnt(18),fill=T2)
d.text((30,232),'(2) el espejo del lado conductor y la barra antivuelco quedan aplanados/ausentes (no son caras planas del mallado). (3) el costado se ve muy escorzado (cámara casi en el eje).',font=fnt(18),fill=T2)
d.text((30,258),'(4) Adonay está a 2 px por px de arte: más "gordo" de píxel que el mundo (1 px) — coherente con los sprites del mapa, no con la densidad del fondo. (5) brazos rígidos; walk de 4 frames.',font=fnt(18),fill=T2)
d.text((30,284),'(6) cámara 5,65 m detrás (no 3–4 m): a 3–4 m con cámara nivelada y FOV 70° los pies salen de cuadro; se priorizó cuerpo entero. (7) sin variante de luces para la T9 3/4.'
            ,font=fnt(18),fill=T2)
d.text((30,310),'(8) Pantone de espaldas es interpretación (el mapa no tiene vista trasera pura); a z 6,0 m su escala Pixi 0,94 vuelve irregular algún píxel. (9) walk de 4 frames sin vaivén de cabeza.',font=fnt(18),fill=T2)
Ht=sum(x.height for x in secs); sheet=Image.new('RGB',(SW,Ht),BG); y=0
for x in secs: sheet.paste(x.convert('RGB'),(0,y)); y+=x.height
os.makedirs(os.path.dirname(DST),exist_ok=True); sheet.save(DST); print(DST,sheet.size,(pt,hp,mg),(pt2,hp2))
