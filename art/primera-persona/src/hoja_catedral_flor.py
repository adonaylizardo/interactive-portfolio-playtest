# Hoja de comparación (BORRADOR): foto real ↔ pieza nueva (encendida / apagada) ↔ versión anterior. Créditos bajo cada foto.
import json, numpy as np
from PIL import Image, ImageDraw, ImageFont
OUT='/workspace/portfolio/forge-paquete/primera-persona/propuesta'; DST='/workspace/portfolio/qa/primera-persona/catedral-flor-comparacion.png'
fnt=lambda s: ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',s)
fb=lambda s: ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',s)
BG=(11,12,14); TX=(237,238,240); T2=(150,155,164); OK=(120,200,140); BAD=(230,90,90); SKY=(16,17,21)
F=json.load(open(f'{OUT}/refs/FUENTES.json'))['fotos']; Q=json.load(open(f'{OUT}/src/qa-v2.json'))
OLDQ={'fachada-catedral-de-barquisimeto__luz-encendida':1.76,'fachada-flor-de-venezuela__luz-encendida':3.90}
def piece(path,h):
    im=Image.open(path).convert('RGBA'); s=h/im.height; im=im.resize((round(im.width*s),h),Image.NEAREST if s>=1 else Image.BOX)
    bg=Image.new('RGBA',im.size,SKY+(255,)); bg.alpha_composite(im); return bg
def photo(path,h):
    im=Image.open(path).convert('RGBA'); s=h/im.height; return im.resize((round(im.width*s),h),Image.LANCZOS)
def checker(w,h,s=6):
    a=np.zeros((h,w,3),np.uint8)+np.array([52,54,60],np.uint8); yy,xx=np.mgrid[0:h,0:w]; a[((yy//s+xx//s)%2)==1]=(74,76,84); return Image.fromarray(a).convert('RGBA')
def amask(path):
    im=Image.open(path).convert('RGBA'); a=np.asarray(im).astype(int); r,g,b,al=[a[...,i] for i in range(4)]
    m=(al>20)&(r>90)&(r-b>55)&(g>b)&(r>=g); o=np.zeros_like(a); o[...,:3]=(a[...,:3]*0.3).astype(int); o[...,3]=np.where(al>0,255,0)
    o[m]=(255,0,200,255); bg=Image.new('RGBA',im.size,SKY+(255,)); bg.alpha_composite(Image.fromarray(o.astype(np.uint8),'RGBA')); return bg
W=3000; rows=[]
def credit(d,x,y,f,maxw):
    t=f"Foto: {f['autor']} · {f['licencia']} · Wikimedia Commons"; d.text((x,y),t,font=fnt(17),fill=T2)
    d.text((x,y+22),f['pagina'],font=fnt(14),fill=(110,115,124))
def block(title,key,photos,checks,ph=430):
    H=ph*2+520; S=Image.new('RGBA',(W,H),BG+(255,)); d=ImageDraw.Draw(S)
    d.text((30,16),title,font=fb(30),fill=TX)
    # fila 1: fotos reales con crédito
    x=30; y=70
    for f,lab in photos:
        p=photo(f'{OUT}/'+f['archivo'],ph); S.alpha_composite(p,(x,y)); d.text((x,y+ph+6),lab,font=fnt(19),fill=TX); credit(d,x,y+ph+32,f,p.width); x+=max(p.width,int(d.textlength(f['pagina'],font=fnt(14))),int(d.textlength(f"Foto: {f['autor']} · {f['licencia']} · Wikimedia Commons",font=fnt(17))))+50
    # fila 2: nueva encendida / apagada / anterior / máscara ámbar
    y2=y+ph+110; x=30
    on=f'{OUT}/piezas/fachada-{key}__luz-encendida@1x.png'; off=f'{OUT}/piezas/fachada-{key}__luz-apagada@1x.png'; old=f'{OUT}/_v2-previo/piezas/fachada-{key}__luz-encendida@1x.png'
    qon=Q[f'fachada-{key}__luz-encendida']; qoff=Q[f'fachada-{key}__luz-apagada']
    items=[(piece(on,ph),f"NUEVA · luces encendidas · ámbar {qon['ambar_pct']} % (opacos) / {qon['ambar_pct_lienzo_total']} % (lienzo)",TX),
           (piece(off,ph),f"NUEVA · luces apagadas · ámbar {qoff['ambar_pct']} %",TX),
           (piece(old,int(ph*0.62)),f"ANTERIOR (v2, desde el iso) · ámbar {OLDQ[f'fachada-{key}__luz-encendida']} %",T2),
           (amask(on).resize((int(Image.open(on).width*ph*0.62/Image.open(on).height),int(ph*0.62)),Image.NEAREST),'máscara ámbar (magenta = cuenta)',T2)]
    for im,lab,col in items:
        if x+im.width>W-20: break
        S.alpha_composite(im,(x,y2+(ph-im.height))); d.text((x,y2+ph+6),lab,font=fnt(18),fill=col); x+=max(im.width,int(d.textlength(lab,font=fnt(18))))+40
    # fila 3: QA hostil
    y3=y2+ph+50; d.text((30,y3),'QA hostil',font=fb(22),fill=TX)
    for i,(ok,t) in enumerate(checks): d.text((30,y3+34+i*28),('✔ ' if ok else '✘ ')+t,font=fnt(19),fill=OK if ok else BAD)
    # zoom ×4 de borde sobre damero (halos)
    zx,zy,zw,zh=zoombox[key]; im=Image.open(on).convert('RGBA').crop((zx,zy,zx+zw,zy+zh)); c=checker(zw,zh,3); c.alpha_composite(im)
    c=c.resize((zw*4,zh*4),Image.NEAREST); S.alpha_composite(c,(W-c.width-30,y3)); d.text((W-c.width-30,y3-26),f'borde @1x ×4 sobre damero · halo {qon["halo_pct"]} % de {qon["borde_px"]} px de borde',font=fnt(16),fill=T2)
    rows.append(S)
zoombox={'catedral-de-barquisimeto':(300,260,140,60),'flor-de-venezuela':(20,40,140,60)}
hdr=Image.new('RGBA',(W,110),BG+(255,)); d=ImageDraw.Draw(hdr)
d.text((30,16),'Primera persona · Catedral y Flor redibujadas desde fotos reales · BORRADOR · 17 oct 2026',font=fb(32),fill=TX)
d.text((30,62),'Fotos: solo referencia (Wikimedia Commons, licencias abajo). Piezas a 16 px/m @1x sobre el color del cielo. Ámbar = r>90, r−b>55, g>b, r≥g sobre alfa>20 · tope 5 %.',font=fnt(20),fill=T2)
rows.append(hdr)
q=Q
block('1 · Catedral Metropolitana de Barquisimeto (Jan Bergkamp, 1968) · 736×588 @1x · 46 × 36,6 m · ancla [368, 587]','catedral-de-barquisimeto',
      [(F[0],'Real · frente (guía del alzado)'),(F[1],'Real · alas con puntas que suben')],
      [(True,'Silueta: torre-linterna hiperbólica perforada + falda que abraza el pórtico, como en la foto'),
       (True,'Cubierta ondulada: alas de vidrio que bajan desde la torre y rematan en punta alzada (silla del paraboloide)'),
       (True,'Pórtico de arco rebajado con borde blanco, 4 pilastras y puerta de cobre con sol tallado'),
       (True,f"Ámbar ≤ 5 %: encendida {q['fachada-catedral-de-barquisimeto__luz-encendida']['ambar_pct']} %, apagada 0 % · halos 0 %"),
       (False,'Campanario exento NO incluido (está a decenas de metros; iría como pieza aparte)'),
       (False,'Alas comprimidas ~9 % en ancho para caber en 46 m; quedan ~9 m de lienzo transparente arriba (cruz a ~27 m)')])
block('2 · Flor de Venezuela (Fruto Vivas, Expo 2000 Hannover → Barquisimeto) · 679×329 @1x · 42,4 × 20,4 m · ancla [339, 328]','flor-de-venezuela',
      [(F[3],'Real · frontal con pétalos abiertos (guía)'),(F[4],'Real · frontal de noche (abanico de pétalos)')],
      [(True,'Silueta: abanico de pétalos abiertos (8 convexos claros + 7 cóncavos oscuros intercalados + el de enfrente de canto) sobre tallo en celosía'),
       (True,'Tambor de vidrio de 2 niveles con balcón, jardineras escalonadas, rampa curva a la izquierda y marquesina del acceso'),
       (True,f"Ámbar ≤ 5 %: encendida {q['fachada-flor-de-venezuela__luz-encendida']['ambar_pct']} %, apagada 0 % · halos 0 %"),
       (False,'Los pétalos son un abanico 2D (alzado), no una proyección 3D: se pierde la profundidad de los de atrás'),
       (False,'Letrero VENEZUELA ilegible a 1x (trazo claro a propósito); la bandera del mástil no se dibuja')],ph=380)
# frame A
fa=Image.open(f'{OUT}/frames/frame-a-a-pie@1x.png').convert('RGBA'); fo=Image.open(f'{OUT}/_v2-previo/frames/frame-a-a-pie@1x.png').convert('RGBA')
S=Image.new('RGBA',(W,820),BG+(255,)); d=ImageDraw.Draw(S)
amb=json.load(open(f'{OUT}/src/ambar-v2.json'))['frames']['frame-a-a-pie']
d.text((30,16),f'3 · Frame A (a pie) re-renderizado con la Catedral nueva · ámbar {amb} % (antes 0,26 %) · solo cambia la zona de la Catedral',font=fb(24),fill=TX)
S.alpha_composite(fa,(30,60)); crop=fa.crop((940,170,1240,370)).resize((600,400),Image.NEAREST); S.alpha_composite(crop,(1340,60)); d.text((1340,470),'recorte ×2 · nueva',font=fnt(18),fill=TX)
crop=fo.crop((940,170,1240,370)).resize((600,400),Image.NEAREST); S.alpha_composite(crop,(1980,60)); d.text((1980,470),'recorte ×2 · anterior',font=fnt(18),fill=T2)
rows.append(S)
order=rows
Ht=sum(r.height for r in order); out=Image.new('RGB',(W,Ht),BG); y=0
for r in order: out.paste(r.convert('RGB'),(0,y)); y+=r.height
out.save(DST); print(DST,out.size)
