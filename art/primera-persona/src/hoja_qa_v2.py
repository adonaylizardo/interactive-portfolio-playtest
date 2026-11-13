# Hoja de QA hostil · primera persona · paquete v2 (BORRADOR). No usa ni incluye las fotos de referencia.
import json, os, sys, numpy as np
from PIL import Image, ImageDraw, ImageFont
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
import build_primera_persona as B, v2_piezas as P, v2_cabina as V
OUT=B.OUT; PZ=f'{OUT}/piezas'; FR=f'{OUT}/frames'; ROOT='/workspace/portfolio/forge-paquete/'
DST='/workspace/portfolio/qa/primera-persona/paquete-v2.png'
fnt=lambda s: ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',s)
mono=lambda s: ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf',s)
BG=(11,12,14); NEU=(64,66,72); TX=(237,238,240); T2=(150,155,164); OK=(120,200,140); BAD=(230,90,90); CY=(80,170,255)
SW=2640
R=json.load(open(f'{OUT}/src/ambar-v2.json'))
def L(n): return Image.open(f'{PZ}/{n}@1x.png').convert('RGBA')
def checker(w,h,s=8):
    a=np.zeros((h,w,3),np.uint8)+np.array([52,54,60],np.uint8); yy,xx=np.mgrid[0:h,0:w]; a[((yy//s+xx//s)%2)==1]=(74,76,84)
    return Image.fromarray(a).convert('RGBA')
def on(bg,im,pos): bg.alpha_composite(im,pos); return bg
import build_v2 as BV
def src4(nm):
    if nm=='jac-t9-volante': return V.volante()
    if nm.startswith('jac-t9-cabina'): return V.cabina2('luces-on' in nm)
    if nm=='jac-t9-capo':
        cp=Image.new('RGBA',(1280*B.K,720*B.K),(0,0,0,0)); B.capo(cp,B.Cam(2.6-0.37,1.45),2.6); return cp
    if nm.startswith('fachada-'):
        k,l=nm[8:].split('__luz-'); return BV.render_fachada(k,l=='encendida')[0]
    if nm=='arbol-cuji-frente': return BV.render_pn(P.arbol_c,P.ARBOL['u0'],P.ARBOL['u1'],P.ARBOL['v1'],5)[0]
    if nm=='banco-frente': return BV.render_pn(P.banco_f,P.BANCO['u0'],P.BANCO['u1'],P.BANCO['v1'])[0]
    if nm.startswith('farol'):
        im=Image.new('RGBA',(24*B.K,76*B.K),(0,0,0,0)); B.farol(B.Pn(im,6*B.K,75*B.K,16*B.K),True); return im
    if nm.startswith('cerros'): return P.avila_tile()[0]
def halo_check(nm):
    """Halo real = píxel de borde semitransparente cuyo color es más oscuro que el píxel opaco MÁS oscuro de su bloque 4×4 de origen
    (o sea, oscuridad que no existe en el dibujo: mezcla con negro transparente). Debe ser 0."""
    im1=L(nm); s4=src4(nm)
    if s4 is None: return 0,0.0
    a1=np.asarray(im1).astype(float); w,h=im1.size
    a4=np.asarray(s4).astype(float)[:h*B.K,:w*B.K].reshape(h,B.K,w,B.K,4).transpose(0,2,1,3,4).reshape(h,w,B.K*B.K,4)
    lum4=a4[...,:3]@np.array([0.3,0.59,0.11]); op4=a4[...,3]>0
    mn=np.where(op4,lum4,1e9).min(-1)
    part=(a1[...,3]>0)&(a1[...,3]<255); n=int(part.sum())
    if n==0: return 0,0.0
    lum1=a1[...,:3]@np.array([0.3,0.59,0.11])
    bad=part&(lum1<mn-3)
    return n,round(100*bad.sum()/n,2)
sections=[]
def sec(h): im=Image.new('RGBA',(SW,h),BG+(255,)); sections.append(im); return im,ImageDraw.Draw(im)
# --- cabecera
s,d=sec(110)
d.text((30,18),'Primera persona · paquete v2 · BORRADOR · QA hostil · 1280×720 @1x · horizonte y=360 · FOV 70° (f=914) · 16 px/m',font=fnt(30),fill=TX)
d.text((30,62),'Fotos de referencia del T9 usadas solo para mirar; no aparecen en esta hoja ni en ninguna pieza. Ámbar = r>90, r−b>55, g>b, r≥g sobre alfa>20 · tope 5 %.',font=fnt(20),fill=T2)
# --- frames
s,d=sec(800)
Bf=Image.open(f'{FR}/frame-b-jac-t9@1x.png').convert('RGBA'); Bo=Image.open('/tmp/frame-b-off.png').convert('RGBA'); A=Image.open(f'{FR}/frame-a-a-pie@1x.png').convert('RGBA')
d.text((30,10),f"(b) JAC T9 · luces-on · ojo 1,45 m · ámbar {R['frames']['frame-b-jac-t9']} %",font=fnt(22),fill=TX); s.alpha_composite(Bf,(30,46))
d.text((1340,10),'(b) cabina luces-off + fachadas apagadas (composición solo para QA)',font=fnt(22),fill=TX); s.alpha_composite(Bo,(1340,46))
s,d=sec(800)
d.text((30,10),f"(a) a pie · ojo 1,78 m · re-renderizado (Ávila, cují, banco nuevos) · ámbar {R['frames']['frame-a-a-pie']} %",font=fnt(22),fill=TX); s.alpha_composite(A,(30,46))
# máscara ámbar del frame B
a=np.asarray(Bf.convert('RGB')).astype(int); r,g,b=a[...,0],a[...,1],a[...,2]; m=(r>90)&(r-b>55)&(g>b)&(r>=g)
o=(a*0.35).astype(np.uint8); o[m]=(255,0,200); s.alpha_composite(Image.fromarray(o).convert('RGBA'),(1340,46))
d.text((1340,10),'máscara ámbar del frame (b): magenta = píxel que cuenta como ámbar',font=fnt(22),fill=TX)
# --- overlays sobre damero
s,d=sec(800)
for i,(tag) in enumerate(('luces-on','luces-off')):
    x=30+i*1310; c=checker(1280,720); c.alpha_composite(L(f'jac-t9-cabina__{tag}')); s.alpha_composite(c,(x,46))
    d.text((x,10),f"jac-t9-cabina__{tag} · 1280×720 · capa 6 · sin volante · ámbar {R['piezas']['jac-t9-cabina__'+tag]['ambar_pct']} %",font=fnt(22),fill=TX)
# --- zoom: ×3 junto a 1x
s,d=sec(1400)
d.text((30,10),'Zoom de la cabina: recorte @1x tal cual (izq.) y ×3 nearest (der.) · ¿se lee a 1x?',font=fnt(22),fill=TX)
crops=[('cuadro con capota',(468,430,812,526)),('pantalla vertical + botonera + rejilla',(876,516,1074,720)),('cubo e insignia JAC',(560,560,720,660))]
x=30; yc=80; rowh=0
for lab,box in crops:
    c=Bf.crop(box); w,h=c.size; z=c.resize((w*3,h*3),Image.NEAREST)
    if x+w+16+z.width>SW: x=30; yc+=rowh+50; rowh=0
    d.text((x,yc-30),lab,font=fnt(18),fill=T2); s.alpha_composite(c,(x,yc)); s.alpha_composite(z,(x+w+16,yc)); x+=w+16+z.width+40; rowh=max(rowh,z.height)
# segunda fila: volante pieza a 1x sobre damero con ancla y ×2
wv=L('jac-t9-volante'); c=checker(wv.width,wv.height); c.alpha_composite(wv); dd=ImageDraw.Draw(c)
ax,ay=V.WHUB; dd.line([(ax-12,ay),(ax+12,ay)],fill=(255,0,200,255)); dd.line([(ax,ay-12),(ax,ay+12)],fill=(255,0,200,255))
y2=yc+rowh+40
d.text((30,y2-4),f"jac-t9-volante · {wv.width}×{wv.height} @1x · ancla magenta = cubo ({ax},{ay}) · colocar en (640,610) · capa 7 · ámbar {R['piezas']['jac-t9-volante']['ambar_pct']} %",font=fnt(18),fill=T2)
s2=sections.pop(); 
s=Image.new('RGBA',(SW,y2+30+wv.height+20),BG+(255,)); s.alpha_composite(s2.crop((0,0,SW,min(s2.height,y2+30))),(0,0)); s.alpha_composite(c,(30,y2+26))
for k,ang in enumerate((-90,-30,30,90)):
    rv=wv.rotate(-ang,resample=Image.NEAREST,center=(ax,ay)); cc=checker(wv.width,wv.height); cc.alpha_composite(rv)
    cc=cc.resize((wv.width*3//4,wv.height*3//4),Image.NEAREST); s.alpha_composite(cc,(540+k*(cc.width+20),y2+26))
    ImageDraw.Draw(s).text((540+k*(cc.width+20),y2+26+cc.height+2),f'giro {ang:+d}° (prueba)',font=fnt(16),fill=T2)
sections.append(s)
# --- fachadas vs iso
keys=['flor-de-venezuela','sambil-barquisimeto','estudio-6x6','casa-volaris','casa-bain','casa-mentoria','casa-finoa','casa-pg','teresa-carreno','biblioteca-ingenieria','catedral-de-barquisimeto']
s,d=sec(60); d.text((30,14),'Fachadas frontales @1x (16 px/m) sobre gris neutro: iso de referencia · luz-encendida · luz-apagada · medidas y ámbar',font=fnt(24),fill=TX)
FA={**{k:B.FACH[k] for k in ('teresa-carreno','biblioteca-ingenieria','catedral-de-barquisimeto')},**P.FACH2}
for k in keys:
    e=L(f'fachada-{k}__luz-encendida'); ap=L(f'fachada-{k}__luz-apagada'); f=FA[k]
    sc=1 if e.width<=1100 else 0.62
    if sc!=1: e=e.resize((int(e.width*sc),int(e.height*sc)),Image.NEAREST); ap=ap.resize(e.size,Image.NEAREST)
    iso=None
    if 'iso' in f and os.path.exists(ROOT+f['iso']): iso=Image.open(ROOT+f['iso']).convert('RGBA'); iso.thumbnail((300,260))
    h=max(e.height,iso.height if iso else 0)+70; s,d=sec(h)
    s.paste(NEU+(255,),(20,40,SW-20,h-8))
    x=30
    if iso: s.alpha_composite(iso,(x,h-12-iso.height)); x+=320
    s.alpha_composite(e,(x,h-12-e.height)); s.alpha_composite(ap,(x+e.width+30,h-12-ap.height))
    ne=R['piezas'][f'fachada-{k}__luz-encendida']; m=f.get('m',(round(f['u1']-f['u0'],1),f['v1']))
    d.text((30,8),f"{k} · {ne['w']}×{ne['h']} px @1x ({ne['w']*2}×{ne['h']*2} @2x) · {m[0]}×{m[1]} m · ancla {ne['ancla']} · ámbar enc. {ne['ambar_pct']} % / apag. {R['piezas'][f'fachada-{k}__luz-apagada']['ambar_pct']} %"+(' · mostrada al 62 %' if sc!=1 else '')+('' if iso else ' · (sin iso nuevo: pieza v1 re-exportada)'),font=fnt(18),fill=TX)
# --- props + ávila + suelos
s,d=sec(470); s.paste(NEU+(255,),(20,40,SW-20,460))
d.text((30,8),'Props billboard @1x y ×3 · Ávila: dos copias del tile pegadas (la costura está en la línea cian)',font=fnt(20),fill=TX)
x=30
for n in ('arbol-cuji-frente','banco-frente','farol-frente__estado-encendido'):
    im=L(n); z=im.resize((im.width*3,im.height*3),Image.NEAREST); c=checker(z.width,z.height); c.alpha_composite(z)
    s.alpha_composite(im,(x,440-im.height)); s.alpha_composite(c,(x+im.width+12,440-c.height))
    ImageDraw.Draw(s).text((x,50),f"{n}\n{im.width}×{im.height} px · ámbar {R['piezas'][n]['ambar_pct']} %",font=fnt(15),fill=T2)
    x+=max(im.width+12+c.width+40,300)
av=L('cerros-avila__tile'); t=Image.new('RGBA',(1100,128)); t.paste(av.crop((1498,0,2048,128)),(0,0)); t.paste(av.crop((0,0,550,128)),(550,0))
t2=t.resize((2200,256),Image.NEAREST); c=Image.new('RGBA',t2.size,(20,22,27,255)); c.alpha_composite(t2)
xa=x; s.alpha_composite(c.crop((0,0,SW-xa-30,256)),(xa,180)); ImageDraw.Draw(s).line([(xa+1100,170),(xa+1100,446)],fill=CY+(255,),width=1)
ImageDraw.Draw(s).text((xa,120),f"cerros-avila__tile 2048×128 · ×2 · costura x=2048|0 · ámbar {R['piezas']['cerros-avila__tile']['ambar_pct']} %",font=fnt(15),fill=T2)
s,d=sec(640); s.paste(NEU+(255,),(20,40,SW-20,630))
d.text((30,8),'Suelos: franjas 512×8 (mostradas ×8 en alto) · planta del cruce 512×512 · planta de plaza 256×256 repetida 2×2',font=fnt(20),fill=TX)
yy=50
for n in list(P.STRIPS)+['suelo-avenida__fase-a','suelo-avenida__fase-b']:
    im=L(n).resize((512,48),Image.NEAREST); s.alpha_composite(im,(30,yy)); ImageDraw.Draw(s).text((550,yy+14),n,font=fnt(15),fill=T2); yy+=60
s.alpha_composite(L('suelo-cruce__planta'),(900,60))
pl=L('suelo-plaza__planta'); t=Image.new('RGBA',(512,512))
for i in range(2):
    for j in range(2): t.paste(pl,(i*256,j*256))
s.alpha_composite(t,(1450,60))
# --- tabla
rows=[]
for nm,v in R['piezas'].items():
    if nm.startswith('suelo') or nm.startswith('cielo'): hv=(0,0.0)
    else: hv=halo_check(nm)
    rows.append((nm,v['w'],v['h'],v['ambar_pct'],hv))
for nm,v in R['frames'].items(): rows.append((nm,1280,720,v,(0,0.0)))
s,d=sec(70+24*((len(rows)+1)//2)+20)
d.text((30,10),'Ámbar y bordes por imagen · halo = % de píxeles de borde semitransparente más oscuros que el píxel opaco más oscuro de su bloque 4×4 de origen (debe ser 0)',font=fnt(20),fill=TX)
half=(len(rows)+1)//2
for i,(nm,w,h,am,(n,hp)) in enumerate(rows):
    x=30+(i//half)*1300; y=50+(i%half)*24
    okA=am<=5; okH=hp==0
    d.text((x,y),f"{nm[:52]:<52} {w:>5}×{h:<4} ámbar {am:>5.2f}%  borde {n:>5}px halo {hp:>4.1f}%",font=mono(16),fill=OK if (okA and okH) else BAD)
S=Image.new('RGB',(SW,sum(x.height for x in sections)),BG); y=0
for x in sections: S.paste(x.convert('RGB'),(0,y)); y+=x.height
os.makedirs(os.path.dirname(DST),exist_ok=True); S.save(DST); print(DST,S.size)
json.dump({r[0]:{'ambar_pct':r[3],'borde_px':r[4][0],'halo_pct':r[4][1]} for r in rows},open(f'{OUT}/src/qa-v2.json','w'),indent=1,ensure_ascii=False)
