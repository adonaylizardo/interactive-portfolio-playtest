# Hoja de QA · primera persona · propuesta (BORRADOR)
import json, numpy as np, sys
from PIL import Image, ImageDraw, ImageFont
sys.path.insert(0,'.')
import build_primera_persona as B
OUT=B.OUT; F=f'{OUT}/frames'
fnt=lambda s: ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',s)
mono=lambda s: ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf',s)
BG=(11,12,14); TX=(237,238,240); T2=(138,143,152); OK=(120,200,140); BAD=(230,90,90)
A=Image.open(f'{F}/frame-a-a-pie@1x.png').convert('RGB'); Bf=Image.open(f'{F}/frame-b-jac-t9@1x.png').convert('RGB')
amb=json.load(open(f'{OUT}/src/ambar.json'))
SW=2640; S=Image.new("RGB",(SW,6400),BG); d=ImageDraw.Draw(S)
d.text((30,20),"Primera persona · propuesta · BORRADOR · viewport 1280×720 @1x · horizonte y=360 (ojo) · FOV 70° (f=914 px) · Estudio noche",font=fnt(30),fill=TX)
d.text((30,62),"Fachadas = planos frontales (escala + traslación, sin deformar) · suelo = proyección por filas · orden por z (painter) · cabina = overlay en pantalla",font=fnt(20),fill=T2)
y=110
for im,lab,key in ((A,'(a) A PIE · Adonay, ojo 1,78 m, acera derecha','frame-a-a-pie'),(Bf,'(b) JAC T9 · puesto del conductor, ojo 1,45 m, carril derecho','frame-b-jac-t9')):
    x=30 if key.startswith('frame-a') else 1340
    d.text((x,y),f"{lab} · ámbar {amb[key]} %",font=fnt(20),fill=TX); S.paste(im,(x,y+30))
y+=30+720+30
# --- perspectiva: horizonte, PF, poste de 1,78 m que debe tocar el horizonte
def persp(im,cam,eye,lab,x0):
    o=im.copy().convert('RGBA'); lay=Image.new('RGBA',o.size,(0,0,0,0)); g=ImageDraw.Draw(lay)
    g.line([(0,360),(1280,360)],fill=(80,170,255,255),width=3)
    for xw in (-5,5,-9.5,9.5,0):
        p=cam.P(xw,0,3); g.line([(p[0]/B.K,p[1]/B.K),(640,360)],fill=(80,170,255,200),width=2)
    g.ellipse([634,354,646,366],outline=(80,170,255,255),width=2)
    for z in (6,12,24):   # postes de altura = ojo: su punta cae exacto en el horizonte
        a=cam.P(cam.cx+1.2 if cam.cx<3 else cam.cx-1.6,0,z); b=cam.P(cam.cx+1.2 if cam.cx<3 else cam.cx-1.6,eye,z)
        g.line([(a[0]/B.K,a[1]/B.K),(b[0]/B.K,b[1]/B.K)],fill=(255,80,200,255),width=3)
    for key,xw,z in (('teresa',14,128),('catedral',76,150),('biblio',-21,62)):
        p=cam.P(xw,0,z); g.line([(p[0]/B.K-60,p[1]/B.K),(p[0]/B.K+60,p[1]/B.K)],fill=(120,230,140,255),width=2)
    o.alpha_composite(lay); o=o.resize((860,484),Image.LANCZOS)
    S.paste(o.convert('RGB'),(x0,y+52)); d.multiline_text((x0,y),lab,font=fnt(17),fill=T2,spacing=2)
persp(A,B.Cam(7.2,1.78),1.78,'perspectiva (a): azul = horizonte y=360 + fugas al PF (640,360)\nmagenta = postes de 1,78 m (la punta toca el horizonte) · verde = suelo de cada fachada',30)
persp(Bf,B.Cam(2.6-0.37,1.45),1.45,'perspectiva (b): mismo PF · postes de 1,45 m (ojo del conductor)\nverde = suelo de cada fachada (z 62 / 128 / 150 m)',900)
# --- máscara de ámbar
def ambmask(im,x0,lab):
    a=np.asarray(im).astype(int); r,g,b=a[...,0],a[...,1],a[...,2]
    m=(r>90)&(r-b>55)&(g>b)&(r>=g)
    o=(a*0.35).astype(np.uint8); o[m]=(255,0,200)
    Image.fromarray(o).resize((860,484),Image.NEAREST).save('/tmp/_m.png'); S.paste(Image.open('/tmp/_m.png'),(x0,y+52))
    d.multiline_text((x0,y),lab+f"\n{m.sum()/m.size*100:.2f} % de los píxeles (tope 5 %)",font=fnt(17),fill=OK if m.mean()<=0.05 else BAD,spacing=2)
ambmask(A,1770,'ámbar (a) en magenta (regla del kit)')
y+=52+484+30
ambmask(Bf,30,'ámbar (b) en magenta')
# paleta: 16 colores más usados por frame
def pal(im,x0,lab):
    q=np.asarray(im.quantize(16,method=Image.Quantize.MEDIANCUT).convert('RGB')).reshape(-1,3)
    cols,cnt=np.unique(q,axis=0,return_counts=True); o=np.argsort(-cnt)
    d.text((x0,y),lab,font=fnt(18),fill=T2)
    for i,k in enumerate(o[:16]):
        cx=x0+(i%8)*76; cy=y+34+(i//8)*84
        d.rectangle([cx,cy,cx+64,cy+48],fill=tuple(int(v) for v in cols[k]),outline=(58,61,68))
        d.text((cx,cy+52),'#%02X%02X%02X'%tuple(int(v) for v in cols[k]),font=mono(12),fill=T2)
        d.text((cx,cy+66),f'{cnt[k]/cnt.sum()*100:.1f}%',font=mono(12),fill=T2)
pal(A,920,'paleta (a): 16 colores dominantes (cuantizado)'); y0=y; y+=230; pal(Bf,920,'paleta (b)'); y=y0
d.text((1580,y),"Tokens del kit usados:",font=fnt(18),fill=TX)
for i,(n,c) in enumerate(B.C.items()):
    if n in ('bg','tileTop','tileSide','tileLine','propFace','propLine','glow','wood','grass','text','text2'):
        pass
toks=[('ui/bg','bg'),('tile-top','tileTop'),('tile-side','tileSide'),('tile-line','tileLine'),('prop-face','propFace'),('prop-line','propLine'),('wood','wood'),('grass','grass'),('glow (luz)','glow')]
for i,(n,k) in enumerate(toks):
    cx=1580+(i%3)*210; cy=y+34+(i//3)*50
    d.rectangle([cx,cy,cx+36,cy+36],fill=B.C[k],outline=(58,61,68)); d.text((cx+44,cy+8),n,font=fnt(15),fill=T2)
y+=484+90
# --- recortes con zoom (nearest)
d.text((30,y),"RECORTES ×4 (nearest) · @1x · buscar: bordes sucios, ruido, siluetas ilegibles, ámbar fuera de lugar",font=fnt(22),fill=TX); y+=36
crops=[(A,(10,230,330,330),'Biblioteca UCV: 2 bóvedas, puntales, fachada rayada + acentos, un ventanal'),
       (A,(500,105,700,300),'Teresa Carreño: torre TALKS, terrazas con sofito'),
       (A,(1000,150,1200,300),'Catedral: torre ahusada, alas, pórtico'),
       (A,(640,250,800,420),'farol (kit, de frente) + banco + charco'),
       (Bf,(420,440,1100,600),'capó Graphite Grey: hombros, domo, filo, plumillas'),
       (Bf,(470,590,810,720),'cuadro + insignia JAC (solo texto) en el volante'),
       (Bf,(790,55,975,125),'retrovisor: barra del platón y cabeceras'),
       (Bf,(0,380,260,620),'pilar A izq. + espejo lateral + vidrio tintado')]
x=30; rowh=0
for im,box,lab in crops:
    c=im.crop(box); w,h=c.size; sc=4 if w<=200 else 3 if w<=330 else 2 if w<=700 else 1
    c=c.resize((w*sc,h*sc),Image.NEAREST)
    if x+c.width>SW-20: x=30; y+=rowh+50; rowh=0
    d.text((x,y),f'{lab} · ×{sc}',font=fnt(16),fill=T2); S.paste(c,(x,y+24)); x+=c.width+24; rowh=max(rowh,c.height)
y+=rowh+60
# --- piezas
d.text((30,y),"PIEZAS @1x (fondo = ui/bg) · ancla centro-inferior · ámbar por pieza (opacos)",font=fnt(22),fill=TX); y+=36
P=amb['piezas']; x=30; rowh=0
for nm in ['fachada-teresa-carreno__luz-encendida','fachada-teresa-carreno__luz-apagada','fachada-biblioteca-ingenieria__luz-encendida','fachada-biblioteca-ingenieria__luz-apagada','fachada-catedral-de-barquisimeto__luz-encendida','fachada-catedral-de-barquisimeto__luz-apagada','farol-frente__estado-encendido']:
    im=Image.open(f'{OUT}/piezas/{nm}@1x.png').convert('RGBA'); im.thumbnail((620,380))
    if x+im.width>SW-20: x=30; y+=rowh+60; rowh=0
    bg=Image.new('RGBA',im.size,BG+(255,)); bg.alpha_composite(im); S.paste(bg.convert('RGB'),(x,y+24))
    i=P[nm]; ok=i['ambar_pct']<=5
    d.text((x,y),f"{nm.replace('fachada-','')} · {i['w']}×{i['h']} · {i['ambar_pct']} %",font=fnt(15),fill=OK if ok else BAD)
    a=i['ancla']; s_=im.width/i['w']; d.ellipse([x+a[0]*s_-4,y+24+a[1]*s_-4,x+a[0]*s_+4,y+24+a[1]*s_+4],outline=(80,170,255),width=2)
    x+=im.width+24; rowh=max(rowh,im.height)
y+=rowh+50
cab=Image.open(f'{OUT}/piezas/jac-t9-cabina__luces-on@1x.png').convert('RGBA')
chk=Image.new('RGBA',cab.size,(60,30,70,255)); chk.alpha_composite(cab); chk=chk.resize((640,360),Image.LANCZOS)
d.multiline_text((30,y-20),"overlay jac-t9-cabina 1280×720\n(morado = transparente: parabrisas y hueco del volante)",font=fnt(15),fill=T2); S.paste(chk.convert('RGB'),(30,y+24))
sk=Image.open(f'{OUT}/piezas/cielo-noche__tile@1x.png').convert('RGB'); sk2=Image.new('RGB',(sk.width*2,sk.height)); sk2.paste(sk,(0,0)); sk2.paste(sk,(sk.width,0)); sk2=sk2.resize((1280,125))
d.text((700,y),"cielo-noche tile 2048×400 repetido ×2 (costura en el centro: no se ve)",font=fnt(15),fill=T2); S.paste(sk2,(700,y+24))
for i,f in enumerate(('a','b')):
    st=Image.open(f'{OUT}/piezas/suelo-avenida__fase-{f}@1x.png').convert('RGB').resize((1024,24),Image.NEAREST)
    d.text((700,y+170+i*60),f"suelo-avenida fase {f} (512×8, sección −16…+16 m)",font=fnt(15),fill=T2); S.paste(st,(700,y+190+i*60))
y+=24+360+30
d.text((30,y),"Estado: BORRADOR. No toca el estado de ningún otro asset. Medición: r>90, r−b>55, g>b, r≥g sobre píxeles opacos (misma regla que relleno/edificios).",font=fnt(18),fill=T2)
S=S.crop((0,0,SW,y+50)); S.save('/workspace/portfolio/qa/primera-persona/propuesta.png'); print(S.size)
