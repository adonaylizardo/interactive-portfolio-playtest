# Hoja de comparación Flor v3b (BORRADOR): fotos reales ↔ v3 (enc./apag.) ↔ v3-profundidad (enc./apag.) ↔ versiones anteriores.
import json, numpy as np
from PIL import Image, ImageDraw, ImageFont
OUT='/workspace/portfolio/forge-paquete/primera-persona/propuesta'; DST='/workspace/portfolio/qa/primera-persona/flor-comparacion-v3.png'
fnt=lambda s: ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',s)
fb=lambda s: ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',s)
BG=(11,12,14); TX=(237,238,240); T2=(150,155,164); OK=(120,200,140); BAD=(230,90,90); SKY=(16,17,21)
F={f['archivo']:f for f in json.load(open(f'{OUT}/refs/FUENTES.json'))['fotos']}; Q=json.load(open(f'{OUT}/src/qa-v2.json')); REP=json.load(open('/tmp/flor3-rep.json'))
W=3000; PH=440
def piece(path,h=PH):
    im=Image.open(path).convert('RGBA'); s=h/im.height; im=im.resize((round(im.width*s),h),Image.NEAREST if s>=1 else Image.BOX)
    bg=Image.new('RGBA',im.size,SKY+(255,)); bg.alpha_composite(im); return bg
def amask(path,h):
    im=Image.open(path).convert('RGBA'); a=np.asarray(im).astype(int); r,g,b,al=[a[...,i] for i in range(4)]
    m=(al>20)&(r>90)&(r-b>55)&(g>b)&(r>=g); o=np.zeros_like(a); o[...,:3]=(a[...,:3]*0.3).astype(int); o[...,3]=np.where(al>0,255,0); o[m]=(255,0,200,255)
    bg=Image.new('RGBA',im.size,SKY+(255,)); bg.alpha_composite(Image.fromarray(o.astype(np.uint8),'RGBA')); s=h/im.height
    return bg.resize((round(im.width*s),h),Image.NEAREST)
rows=[]
def row(title,h): S=Image.new('RGBA',(W,h),BG+(255,)); d=ImageDraw.Draw(S); d.text((30,12),title,font=fb(24),fill=TX); rows.append(S); return S,d
def put(S,d,items,y=52):
    x=30
    for im,lab,col in items:
        S.alpha_composite(im,(x,y)); yy=y+im.height+6
        for i,l in enumerate(lab.split('\n')): d.text((x,yy+i*24),l,font=fnt(18 if i==0 else 15),fill=col if i==0 else T2)
        x+=max(im.width,max(int(d.textlength(l,font=fnt(18))) for l in lab.split('\n')))+46
S,d=row('Flor de Venezuela · v3 rehecha (pétalos = hojas curvas que se abren hacia arriba y afuera) · BORRADOR · 17 oct 2026',80)
d.text((30,48),'Fotos: solo referencia (Wikimedia Commons). Piezas a 1x ampliadas sobre el color del cielo. Ámbar = r>90, r−b>55, g>b, r≥g sobre alfa>20 · tope 5 %.',font=fnt(16),fill=T2)
# fila 1: fotos
S,d=row('1 · Fotos reales',PH+140)
items=[]
for k,lab in (('refs/flor-frontal_miguel-ahiezer-salcedo.jpg','Real · de día, frontal (guía de los pétalos)'),('refs/flor-noche_beachpow.jpg','Real · de noche, frontal')):
    f=F[k]; im=Image.open(f'{OUT}/'+k).convert('RGBA'); im=im.resize((round(im.width*PH/im.height),PH),Image.LANCZOS)
    items.append((im,f"{lab}\nFoto: {f['autor']} · {f['licencia']} · Wikimedia Commons\n{f['pagina']}",TX))
put(S,d,items)
def pair(title,key):
    S,d=row(title,PH+110); on=f'{OUT}/piezas/fachada-{key}__luz-encendida@1x.png'; off=f'{OUT}/piezas/fachada-{key}__luz-apagada@1x.png'
    qn=Q[f'fachada-{key}__luz-encendida']; qf=Q[f'fachada-{key}__luz-apagada']
    put(S,d,[(piece(on),f"Luces encendidas · ámbar {qn['ambar_pct']} % (opacos) / {qn['ambar_pct_lienzo_total']} % (lienzo) · halo {qn['halo_pct']} %",TX),
             (piece(off),f"Luces apagadas · ámbar {qf['ambar_pct']} % · halo {qf['halo_pct']} %",TX),
             (amask(on,220),'máscara ámbar (magenta)',T2)])
pair('2 · Flor v3 · fachada-flor-de-venezuela · 679×329 @1x · 42,4 × 20,4 m · ancla [339, 328] (dentro del lienzo actual)','flor-de-venezuela')
pair('3 · Flor v3-profundidad · fachada-flor-de-venezuela-profundidad · mismo lienzo y ancla · pétalos de atrás más oscuros y parcialmente tapados','flor-de-venezuela-profundidad')
S,d=row('4 · Versiones anteriores (para contraste) y propuesta de lienzo más alto',PH+110)
pr=REP['propuesta']
put(S,d,[(piece(f'{OUT}/_v3-flor-previo/piezas/fachada-flor-de-venezuela__luz-encendida@1x.png',300),'Anterior · RECHAZADA (abanico ancho y achatado → domo/paraguas)',BAD),
         (piece(f'{OUT}/_v2-previo/piezas/fachada-flor-de-venezuela__luz-encendida@1x.png',300),'v2 original (inventada desde el iso)',T2),
         (piece(pr['archivo'],round(300*pr['tamano_1x'][1]/329)),f"Propuesta (no entregada como pieza): lienzo {pr['tamano_1x'][0]}×{pr['tamano_1x'][1]} @1x, {pr['v1_m']} m de alto,\nancla {pr['ancla']} · corona sin comprimir (capitel 13,8 m, proporción de la foto de día)",TX)])
S,d=row('5 · QA hostil',300)
checks=[(True,'Cada pétalo es una hoja curva separada (con aire entre hojas), con lomo arqueado, membrana festoneada debajo y punta aguda propia'),
        (True,'Las hojas nacen del capitel (brazos radiales de acero) y se abren HACIA ARRIBA y AFUERA, como corona de palma; las laterales caen en la punta como en la foto'),
        (True,'No se lee como domo/paraguas: la silueta superior es dentada (puntas y crestas), no un borde continuo'),
        (True,f"Ámbar ≤ 5 % y halos 0 % en las 4 imágenes; apagadas 0 % · el frame A no incluye la Flor (no se re-renderizó)"),
        (False,'Dentro de 20,4 m la corona va comprimida al 80 % en vertical respecto de la foto de día (cámara baja). Sin comprimir hacen falta 22,9 m (679×369, ancla [339, 368])'),
        (False,'Plana: 11 hojas visibles (5 por lado + la central de frente); la real tiene 16 → las 5 restantes solo aparecen en la variante con profundidad'),
        (False,'Luz real verde/blanca → aquí ámbar en el capitel y tibio oscuro bajo las hojas (regla del kit); letrero ilegible a 1x, sin bandera')]
for i,(ok,t) in enumerate(checks): d.text((30,50+i*34),('✔ ' if ok else '✘ ')+t,font=fnt(20),fill=OK if ok else BAD)
Ht=sum(r.height for r in rows); out=Image.new('RGB',(W,Ht),BG); y=0
for r in rows: out.paste(r.convert('RGB'),(0,y)); y+=r.height
out.save(DST); print(DST,out.size)
