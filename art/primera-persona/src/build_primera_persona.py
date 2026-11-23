# Primera persona · propuesta (BORRADOR) · PIL · Estudio noche
# Cámara pinhole sin pitch: horizonte = altura del ojo. Fachadas = planos frontales (paralelos a la imagen),
# así que proyectarlos es solo escala + traslación (exacto, sin deformar). Suelo = proyección por filas (OutRun).
import json, math, random, os
from PIL import Image, ImageDraw, ImageFont
import numpy as np
OUT='/workspace/portfolio/forge-paquete/primera-persona/propuesta'
FP='/workspace/portfolio/forge-paquete'
K=4                      # supersampling sobre @1x (igual que los build_* del mapa)
W,H=1280,720; HZ=360     # viewport de referencia @1x · horizonte a la altura del ojo
FOC=914                  # focal @1x = 640/tan(35°) → FOV horizontal 70°
PPM=16                   # densidad de las piezas de fachada @1x (px por metro); @2x = 32
C=dict(bg=(11,12,14),tileTop=(26,28,32),tileSide=(18,19,22),tileLine=(58,61,68),propFace=(36,38,43),
       propLine=(90,94,102),glow=(255,181,71),wood=(42,37,33),text=(237,238,240),text2=(138,143,152),
       grass=(23,28,24),glass=(14,16,20),warm=(110,84,46),dim=(74,58,38),soffit=(170,126,62),
       shell=(120,124,132),mid=(31,33,38),flag=(40,42,46))
ACC=[(92,56,40),(94,84,50),(58,61,68)]   # acentos Villanueva apagados (mismos que el mapa)
FOG=(28,30,36)
def lerp(a,b,t): return tuple(int(a[i]+(b[i]-a[i])*t) for i in range(3))
FONT={'T':["11111","00100","00100","00100","00100","00100","00100"],'A':["01110","10001","10001","11111","10001","10001","10001"],
      'L':["10000","10000","10000","10000","10000","10000","11111"],'K':["10001","10010","10100","11000","10100","10010","10001"],
      'S':["01111","10000","10000","01110","00001","00001","11110"],'J':["00111","00010","00010","00010","00010","10010","01100"],
      'C':["01111","10000","10000","10000","10000","10000","01111"]}

class Pn:
    """Pintor de alzado: (u,v) en metros, u=0 centro de la fachada, v=0 línea de suelo."""
    def __init__(s,im,ox,oy,ppx,lw=K):
        s.im=im; s.d=ImageDraw.Draw(im,'RGBA'); s.ox,s.oy,s.s,s.lw=ox,oy,ppx,lw
    def p(s,u,v): return (s.ox+u*s.s, s.oy-v*s.s)
    def poly(s,pts,fill,line=C['propLine'],w=1.0):
        q=[s.p(*a) for a in pts]
        if fill: s.d.polygon(q,fill=fill)
        if line: s.d.line(q+[q[0]],fill=line,width=max(1,int(s.lw*w)),joint='curve')
    def rect(s,u0,v0,u1,v1,fill,line=C['propLine'],w=1.0): s.poly([(u0,v0),(u1,v0),(u1,v1),(u0,v1)],fill,line,w)
    def line(s,pts,col,w=1.0): s.d.line([s.p(*a) for a in pts],fill=col,width=max(1,int(s.lw*w)))
    def hline(s,u0,u1,v,col,w=0.5): s.line([(u0,v),(u1,v)],col,w)
    def refresh(s): s.d=ImageDraw.Draw(s.im,'RGBA')

# ---------------- FACHADAS (alzados frontales, metros) ----------------
def teresa(pn,luz=True):
    ol=C['propLine']
    # bloque de hormigón detrás de las terrazas
    pn.rect(-27,0,-9,27,C['tileSide'],ol)
    for v in (9,15,21): pn.hline(-27,-9,v,C['tileLine'])
    # flanco piramidal (Sala Ríos Reyna): trapecio con nervaduras horizontales
    bx0,bx1,tx0,tx1,PZ=1.5,25,5.5,21,31
    pn.poly([(bx0,0),(bx1,0),(tx1,PZ),(tx0,PZ)],C['mid'],ol)
    n=20
    for k in range(n):
        t0=k/n; t1=(k+1)/n
        a0=bx0+(tx0-bx0)*t0; b0=bx1+(tx1-bx1)*t0; a1=bx0+(tx0-bx0)*t1; b1=bx1+(tx1-bx1)*t1
        pn.poly([(a0,PZ*t0),(b0,PZ*t0),(b1,PZ*t1),(a1,PZ*t1)],(36,38,43) if k%2 else (28,30,34),None)
        pn.hline(a1,b1,PZ*t1,C['tileLine'],0.5)
    pn.poly([(bx0,0),(bx1,0),(tx1,PZ),(tx0,PZ)],None,ol)
    pn.rect(tx0+0.6,PZ,tx1-0.6,PZ+0.6,C['propFace'],ol)
    pn.rect(tx0+2,PZ+0.6,tx0+6,PZ+3.2,C['propFace'],ol)            # sala de máquinas
    # anexo bajo al pie del flanco
    pn.rect(8,0,26,7,C['tileTop'],ol)
    pn.rect(9.5,2.6,24.5,4.4,C['glass'],None)
    if luz:
        pn.rect(9.5,2.6,24.5,4.4,C['dim'],None)
        for u in np.arange(10.2,24,2.0): pn.rect(u,3.0,u+0.7,4.0,C['warm'],None)
    for u in range(10,25,2): pn.line([(u+0.5,2.6),(u+0.5,4.4)],C['tileSide'],0.5)
    # terrazas en voladizo: núcleo vidriado + columnas + losa con canto inclinado y sofito iluminado
    S=[(-31,-9,19,22.4),(-34,-13,12.4,15.8),(-37,-17,5.8,9.2)]
    for (a,b,v0,v1) in S:
        ca,cb=a+3.2,b-3.0; vb=0 if v0<8 else v0-6.6
        pn.rect(ca,vb,cb,v0,C['glass'],C['tileLine'])
        if luz:
            pn.rect(ca+0.3,v0-2.4,cb-0.3,v0-0.7,C['dim'],None)              # banda interior tibia (no cuenta como ámbar)
            for u in np.arange(ca+0.9,cb-0.5,1.6): pn.rect(u,v0-2.3,u+0.5,v0-0.9,C['warm'],None)
        for u in np.arange(ca+0.8,cb,1.6): pn.line([(u,vb),(u,v0)],(30,33,38),0.5)
        for u in (a+1.6,b-1.4): pn.rect(u-0.25,vb,u+0.25,v0,C['propFace'],C['tileLine'],0.5)
        # losa: trapecio (más ancho arriba) + cornisa
        pn.poly([(a+0.9,v0),(b-0.9,v0),(b,v1-0.7),(a,v1-0.7)],C['tileTop'],ol)
        pn.rect(a,v1-0.7,b,v1,C['propFace'],ol)
        if luz: pn.line([(a+1.1,v0+0.12),(b-1.1,v0+0.12)],C['soffit'],1.0)
    # torre con franja de vidrio (cálida de noche) y TALKS
    tx,tw,th=-8.2,6.2,37
    pn.rect(tx,0,tx+tw,th,C['tileTop'],ol)
    pn.rect(tx+tw-0.4,0,tx+tw,th,C['tileSide'],None)
    gx0,gx1=tx+1.4,tx+tw-1.4
    pn.rect(gx0,0.8,gx1,th-1.2,C['glass'],ol)
    v=1.6
    while v<10.5:
        if luz: pn.rect(gx0+0.15,v,gx1-0.15,v+0.45,(84,66,42),None)
        pn.hline(gx0,gx1,v-0.4,(30,33,38)); v+=1.2
    col=C['glow'] if luz else (60,63,70); pz=(gx1-gx0)/7.0; vt=th-2.6
    for ch in 'TALKS':
        vt-=7*pz
        for r,row in enumerate(FONT[ch]):
            for c,bit in enumerate(row):
                if bit=='1':
                    u=gx0+pz*(0.75+c); vv=vt+(6-r)*pz; pn.rect(u,vv,u+pz,vv+pz,col,None)
        vt-=pz*1.6
    # plinto y faroles de la plaza los pone la escena
    pn.rect(-38,-0.01,27,0.5,C['tileTop'],C['tileLine'],0.5)

VB=[(-11.2,0),(0,11.2)]   # dos bóvedas de 11.2 m
SPR,CRN=4.2,10.6
def vz(u):
    for a,b in VB:
        if a-1e-9<=u<=b+1e-9:
            t=(u-(a+b)/2)/((b-a)/2); return SPR+(CRN-SPR)*max(0,1-t*t)**0.6
    return SPR
def arch(a,b,n=40,off=0.0): return [(a+(b-a)*i/n, vz(a+(b-a)*i/n)+off) for i in range(n+1)]
def biblioteca(pn,luz=True):
    ol=C['propLine']; rnd=random.Random(5)
    # puntales inclinados traseros (asoman detrás, a ambos lados)
    for (a,b) in VB:
        pts=arch(a,b)
        pn.poly([(a,0)]+pts+[(b,0)],C['tileSide'],None)
        # bandas horizontales de paneles oscuros (fachada rayada)
        for v in np.arange(0.5,CRN,0.5):
            us=[p[0] for p in pts if p[1]>=v]
            if len(us)>1: pn.hline(min(us)+0.05,max(us)-0.05,v,(44,47,53))
        # juntas verticales desfasadas
        for v in np.arange(0.5,CRN,0.5):
            us=[p[0] for p in pts if p[1]>=v+0.5]
            if len(us)<2: continue
            u=min(us)+rnd.uniform(0.5,2.5)
            while u<max(us)-0.5: pn.line([(u,v),(u,v+0.5)],(38,40,46),0.5); u+=rnd.uniform(2.6,4.2)
    # bóveda izquierda: fachada rayada con acentos + banda de ventanas bajas
    a,b=VB[0]
    placed=[]; tries=0
    while len(placed)<8 and tries<400:
        tries+=1; v=rnd.choice(list(np.arange(3.5,CRN-1.2,0.5))); u=rnd.uniform(a+0.8,b-2.2); w_=rnd.choice((1.0,1.5,2.0))
        if vz(u)<v+1.0 or vz(u+w_)<v+1.0: continue
        if any(abs(v-pv)<1.1 and u<pu+pw+0.8 and pu<u+w_+0.8 for pu,pv,pw in placed): continue
        pn.rect(u,v,u+w_,v+0.5,ACC[len(placed)%3],None); placed.append((u,v,w_))
    wa,wb=a+1.2,b-1.0
    pn.rect(wa,0.4,wb,2.9,C['glass'],None)
    if luz:
        for i in range(8): pn.rect(wa,0.4+2.5*i/8,wb,0.4+2.5*(i+1)/8,lerp((72,57,38),(22,22,26),i/7),None)
    for u in np.arange(wa,wb+0.01,(wb-wa)/12): pn.line([(u,0.4),(u,2.9)],C['shell'],0.6)
    for v in (0.4,2.9): pn.hline(wa,wb,v,C['shell'],0.8)
    # puerta
    pn.rect(-6.4,0,-4.6,2.6,C['warm'] if luz else C['glass'],C['shell'],0.8); pn.line([(-5.5,0),(-5.5,2.6)],C['shell'],0.6)
    # bóveda derecha: UN ventanal alto vidriado (degradado cálido abajo → frío arriba)
    a,b=VB[1]; wa,wb,wt=a+1.0,b-1.0,8.2
    pn.rect(wa,0.3,wb,wt,C['glass'],None)
    if luz:
        n=16
        for i in range(n): pn.rect(wa,0.3+(wt-0.3)*i/n,wb,0.3+(wt-0.3)*(i+1)/n,lerp((76,60,40),(20,20,24),(i/(n-1))**0.8),None)
        for k in range(6):                      # estanterías en silueta (una sola planta)
            u=wa+0.4+k*(wb-wa-1.0)/5; pn.rect(u,0.3,u+0.5,2.1,(40,34,28),None)
    for v in (0.3,2.6,5.4,wt): pn.hline(wa,wb,v,C['shell'],0.8)
    for u in np.linspace(wa,wb,8): pn.line([(u,0.3),(u,wt)],C['shell'],0.6 if wa<u<wb else 0.9)
    # acentos sobre el ventanal (pocos)
    for (u,v,w_,c) in ((a+1.6,8.8,1.6,ACC[0]),(b-3.2,8.8,1.4,ACC[1])):
        if vz(u)>v+0.6 and vz(u+w_)>v+0.6: pn.rect(u,v,u+w_,v+0.5,c,None)
    # borde blanco de la cáscara con espesor
    for (a,b) in VB:
        inner=arch(a,b); outer=arch(a-0.05,b+0.05,off=0.45)
        pn.poly(inner+outer[::-1],C['shell'],None)
        pn.line(outer,ol,1.0); pn.line(inner,ol,1.0)
    pn.rect(-0.18,0,0.18,SPR+0.3,C['shell'],ol,0.6)                  # columna central
    # puntales delanteros: salen del arranque de cada bóveda exterior hacia afuera y abajo
    for s_ in (-1,1):
        x0=s_*11.15; x1=s_*13.9
        pn.poly([(x0,SPR+0.5),(x0+s_*0.42,SPR+0.5),(x1+s_*0.25,0.0),(x1-s_*0.2,0.0)],C['propFace'],ol)
        pn.line([(x0+s_*0.2,SPR+0.4),(x1,0.1)],(96,100,108),0.6)
        pn.rect(min(x1-0.45,x1+0.45),0,max(x1-0.45,x1+0.45),0.45,C['tileLine'],ol,0.6)   # zapata
    pn.rect(-14.5,-0.01,14.5,0.12,(40,34,32),None)                   # vereda rojiza apagada

def catedral(pn,luz=True):
    ol=C['propLine']; rnd=random.Random(9)
    # alas: paraboloides hiperbólicos (borde superior curvo que sube hacia la punta exterior)
    def wing(s_):
        top=[(s_*(3.2+18.8*t), 7.5+6.8*t**1.8 - 1.2*math.sin(t*math.pi)) for t in np.linspace(0,1,30)]
        bot=[(s_*(3.2+18.8*t), 3.2+1.6*t**2) for t in np.linspace(1,0,30)]
        pn.poly(top+bot,C['tileSide'],ol)
        # cara inferior en sombra + nervaduras regladas (pocas)
        lo=[(top[i][0], bot[29-i][1]+(top[i][1]-bot[29-i][1])*0.38) for i in range(30)]
        pn.poly(lo+bot,(14,15,18),None)
        for k in range(1,6):
            t=k/6; i=int(t*29)
            pn.line([top[i],lo[i]],(40,42,47),0.5)
        pn.line(top,(150,154,162),0.9)
    wing(-1); wing(1)
    # tambor/base con ranuras verticales
    pn.rect(-22.5,0,22.5,3.3,C['tileSide'],ol)
    for u in np.arange(-21.5,22,1.5):
        if abs(u)<4.5: continue
        pn.rect(u,0.6,u+0.22,2.7,C['warm'] if (luz and rnd.random()<0.35) else C['glass'],None)
    # torre central ahusada (más ancha abajo) con costura clara
    prof=[(3.6*(1-0.42*(v/30)**1.3),v) for v in np.linspace(0,30,24)]
    pn.poly([(-p[0],p[1]) for p in prof]+[(p[0],p[1]) for p in prof[::-1]],C['tileTop'],ol)
    pn.poly([(0,0)]+[(p[0],p[1]) for p in prof]+[(0,30)],C['mid'],None)
    pn.line([(0,0.5),(0,29.6)],C['shell'],0.7)
    for v in np.arange(9,29,2.2):
        for u in (-1.2,1.2):
            ww=3.6*(1-0.42*(v/30)**1.3)
            if abs(u)<ww-0.5: pn.rect(u-0.12,v,u+0.12,v+0.5,C['glass'] if not luz or v<20 else (60,63,70),None)
    pn.rect(-2.2,30,2.2,31.2,C['propFace'],ol)                     # anillo de remate
    pn.line([(0,31.2),(0,36.2)],C['propLine'],1.0); pn.line([(-1.3,34.6),(1.3,34.6)],C['propLine'],1.0)   # cruz
    # pórtico parabólico con puerta
    ar=[(4.2*math.sin(t), 0+8.8*math.cos(t)**0.9) for t in np.linspace(-math.pi/2,math.pi/2,30)]
    pn.poly(ar,C['shell'],ol)
    ar2=[(3.4*math.sin(t), 7.6*math.cos(t)**0.9) for t in np.linspace(-math.pi/2,math.pi/2,30)]
    pn.poly(ar2,C['glass'],None)
    pn.rect(-1.0,0,1.0,3.6,C['glow'] if luz else C['tileLine'],None)
    pn.line([(0,0),(0,3.6)],C['warm'] if luz else C['tileSide'],0.6)
    pn.rect(-23,-0.01,23,0.35,C['tileTop'],C['tileLine'],0.5)

FACH={'teresa-carreno':dict(fn=teresa,u0=-38,u1=27,v1=38.2,nombre='Teatro Teresa Carreño (Talks)'),
      'biblioteca-ingenieria':dict(fn=biblioteca,u0=-14.6,u1=14.6,v1=11.4,nombre='Biblioteca Ingeniería UCV (Writings)'),
      'catedral-de-barquisimeto':dict(fn=catedral,u0=-23,u1=23,v1=36.6,nombre='Catedral de Barquisimeto')}

def farol(pn,on=True):
    """Farol del kit (paisaje/farol-exterior / farol-noche) redibujado de frente: poste, brazo, cabeza cúbica, luz abajo."""
    ol=(58,61,68)
    pn.rect(-0.22,0,0.22,0.35,C['tileSide'],ol,0.8)               # base
    pn.rect(-0.07,0.35,0.07,4.3,C['tileSide'],ol,0.6)            # poste
    pn.rect(-0.07,4.15,0.75,4.3,C['tileSide'],ol,0.6)            # brazo
    pn.rect(0.5,3.9,1.05,4.45,C['tileTop'],ol,0.8)               # cabeza
    if on: pn.rect(0.67,3.8,0.88,3.9,C['glow'],None)
def farol_halo(im,pn,on=True,z=10.0):
    if not on: return
    lay=Image.new('RGBA',im.size,(0,0,0,0)); dl=ImageDraw.Draw(lay)
    cx,cy=pn.p(0.775,3.78); r=0.55*abs(pn.s)
    for f,a in ((1.0,10),(0.66,16),(0.36,26)):
        dl.ellipse([cx-r*f,cy-r*f*0.8,cx+r*f,cy+r*f*0.8],fill=(255,181,71,a))
    im.alpha_composite(lay)

# ---------------- CÁMARA / ESCENA ----------------
class Cam:
    def __init__(s,cx,eye): s.cx,s.eye=cx,eye
    def P(s,x,y,z): k=FOC/z; return ((W/2+(x-s.cx)*k)*K,(HZ-(y-s.eye)*k)*K)
    def scale(s,z): return FOC/z*K
def sky(im):
    d=ImageDraw.Draw(im); top=(8,9,11); hor=(30,32,39)
    for y in range(HZ*K):
        t=(y/(HZ*K))**1.6; d.line([(0,y),(W*K,y)],fill=lerp(top,hor,t))
    rnd=random.Random(21)
    for i in range(260):
        x=rnd.uniform(0,W); y=rnd.uniform(0,HZ*0.78)**1.0
        b=rnd.random(); c=C['text'] if b>0.93 else C['text2'] if b>0.6 else (70,74,82)
        sz=1 if b<0.97 else 2
        d.rectangle([int(x)*K,int(y)*K,(int(x)+sz)*K-1,(int(y)+sz)*K-1],fill=c)
def cerros(im,cam,seed=3):
    """El Ávila: silueta lejana (capa de parallax casi fija)."""
    d=ImageDraw.Draw(im,'RGBA'); rnd=random.Random(seed); pts=[]; n=64
    for i in range(n+1):
        x=i/n*W; h=34+26*math.sin(i*0.21+1.3)+14*math.sin(i*0.57)+rnd.uniform(-3,3)
        pts.append((x*K,(HZ-h)*K))
    d.polygon(pts+[(W*K,HZ*K+2*K),(0,HZ*K+2*K)],fill=(17,18,22))
    d.line(pts,fill=(34,36,42),width=K)
    # luces de ranchos en el cerro: puntos fríos y muy pocos tibios (no ámbar)
    for i in range(70):
        x=rnd.uniform(0,W); top=min(p[1] for p in pts if abs(p[0]-x*K)<W*K/n*1.2)/K
        y=rnd.uniform(top+6,HZ-2)
        d.rectangle([int(x)*K,int(y)*K,int(x)*K+K-1,int(y)*K+K-1],fill=(70,74,82) if rnd.random()<0.8 else (96,82,60))
def gpoly(d,cam,pts,fill,zmin=2.2):
    """polígono en el plano del suelo (x,z), recortado a z>=zmin"""
    out=[]; n=len(pts)
    for i in range(n):
        a=pts[i]; b=pts[(i+1)%n]
        if a[1]>=zmin: out.append(a)
        if (a[1]>=zmin)!=(b[1]>=zmin):
            t=(zmin-a[1])/(b[1]-a[1]); out.append((a[0]+(b[0]-a[0])*t,zmin))
    if len(out)>=3: d.polygon([cam.P(x,0,z) for x,z in out],fill=fill)
def gline(d,cam,a,b,col,w=1):
    if a[1]<2.2 and b[1]<2.2: return
    if a[1]<2.2: t=(2.2-a[1])/(b[1]-a[1]); a=(a[0]+(b[0]-a[0])*t,2.2)
    if b[1]<2.2: t=(2.2-b[1])/(a[1]-b[1]); b=(b[0]+(a[0]-b[0])*t,2.2)
    d.line([cam.P(a[0],0,a[1]),cam.P(b[0],0,b[1])],fill=col,width=max(1,int(K*w)))
FAR=600
ZX0,ZX1=34,44            # calle transversal
def suelo(im,cam):
    d=ImageDraw.Draw(im,'RGBA')
    d.rectangle([0,HZ*K,W*K,H*K],fill=C['tileSide'])
    gpoly(d,cam,[(-300,48),(300,48),(300,FAR),(-300,FAR)],(21,22,26))                     # plaza lejana
    for z in np.arange(50,140,4): gline(d,cam,(-300,z),(300,z),(26,28,32),0.5)
    gpoly(d,cam,[(-300,44),(300,44),(300,48),(-300,48)],C['propFace'])                    # acera del frente
    gpoly(d,cam,[(-300,ZX0),(300,ZX0),(300,ZX1),(-300,ZX1)],(22,23,27))                   # calle transversal
    for x in np.arange(-60,60,9): gline(d,cam,(x,39),(x+4,39),C['tileLine'],0.7)
    # zonas verdes laterales
    gpoly(d,cam,[(-300,0),(-9.5,0),(-9.5,ZX0),(-300,ZX0)],C['grass'])
    gpoly(d,cam,[(9.5,0),(300,0),(300,ZX0),(9.5,ZX0)],C['grass'])
    # avenida + aceras
    gpoly(d,cam,[(-5,0),(5,0),(5,ZX0),(-5,ZX0)],(22,23,27))
    for s_ in (-1,1):
        gpoly(d,cam,[(s_*5.25,0),(s_*9.5,0),(s_*9.5,ZX0),(s_*5.25,ZX0)],C['propFace'])
        gpoly(d,cam,[(s_*5.0,0),(s_*5.25,0),(s_*5.25,ZX0),(s_*5.0,ZX0)],C['propLine'])     # brocal
        for z in np.arange(2,ZX0,2.0): gline(d,cam,(s_*5.25,z),(s_*9.5,z),C['tileLine'],0.5)
        gline(d,cam,(s_*9.5,0.1),(s_*9.5,ZX0),C['tileLine'],0.6)
    for z in np.arange(1,ZX0-2,6): gline(d,cam,(0,z),(0,z+3),(120,124,132),0.9)               # línea discontinua
    for s_ in (-1,1): gline(d,cam,(s_*4.6,0.1),(s_*4.6,ZX0),(58,61,68),0.6)                 # borde de carril
    # paso peatonal en la boca de la calle transversal
    for x in np.arange(-4.6,4.6,0.9): gpoly(d,cam,[(x,ZX0-3.2),(x+0.45,ZX0-3.2),(x+0.45,ZX0-0.4),(x,ZX0-0.4)],(52,55,61))
def fog_layer(lay,a):
    if a<=0: return lay
    arr=np.asarray(lay).astype(float); f=np.array(FOG,float)
    arr[...,:3]=arr[...,:3]*(1-a)+f*a; return Image.fromarray(arr.astype(np.uint8),'RGBA')
def place_fachada(im,cam,key,x,z,luz=True):
    lay=Image.new('RGBA',im.size,(0,0,0,0)); sx,sy=cam.P(x,0,z)
    pn=Pn(lay,sx,sy,cam.scale(z)); FACH[key]['fn'](pn,luz)
    im.alpha_composite(fog_layer(lay,min(0.28,max(0,(z-40)/220))))
def place_farol(im,cam,x,z,flip=False,on=True):
    lay=Image.new('RGBA',im.size,(0,0,0,0)); sx,sy=cam.P(x,0,z); pn=Pn(lay,sx,sy,cam.scale(z))
    if flip: pn.s=-pn.s; pn.p=lambda u,v,pn=pn: (pn.ox+u*pn.s, pn.oy+v*pn.s)
    farol(pn,on); farol_halo(lay,pn,on); im.alpha_composite(lay)
    if on and z>8:   # charco de luz en el suelo (alfa baja)
        l2=Image.new('RGBA',im.size,(0,0,0,0)); d=ImageDraw.Draw(l2)
        lx=x+(-0.78 if flip else 0.78)
        for f in (1.0,0.62,0.32):
            r=2.6*f
            pts=[cam.P(lx+r*math.cos(t),0,max(2.3,z+r*0.9*math.sin(t))) for t in np.linspace(0,2*math.pi,24)]
            d.polygon(pts,fill=(255,181,71,7))
        im.alpha_composite(l2)
def banco(im,cam,x,z):
    lay=Image.new('RGBA',im.size,(0,0,0,0)); sx,sy=cam.P(x,0,z); pn=Pn(lay,sx,sy,cam.scale(z))
    for u in (-0.8,0.7): pn.rect(u,0,u+0.1,0.45,C['tileSide'],(58,61,68),0.6)
    pn.rect(-0.9,0.42,0.9,0.5,C['wood'],(58,61,68),0.6)        # asiento (madera charcoal del kit)
    pn.rect(-0.9,0.62,0.9,0.72,C['wood'],(58,61,68),0.6); pn.rect(-0.9,0.8,0.9,0.9,C['wood'],(58,61,68),0.6)
    for u in (-0.8,0.7): pn.rect(u,0.5,u+0.08,0.9,C['tileSide'],None)
    im.alpha_composite(lay)
def seto(im,cam,x0,x1,z,h=0.9):
    d=ImageDraw.Draw(im,'RGBA'); a=cam.P(x0,h,z); b=cam.P(x1,0,z)
    d.rectangle([min(a[0],b[0]),a[1],max(a[0],b[0]),b[1]],fill=(20,25,21))
    d.line([(min(a[0],b[0]),a[1]),(max(a[0],b[0]),a[1])],fill=(33,41,34),width=K)
def arbol(im,cam,x,z,h=6.0,seed=1):
    lay=Image.new('RGBA',im.size,(0,0,0,0)); d=ImageDraw.Draw(lay); sx,sy=cam.P(x,0,z); s=cam.scale(z); rnd=random.Random(seed)
    d.rectangle([sx-0.16*s,sy-h*0.45*s,sx+0.16*s,sy],fill=(30,27,25))
    greens=[(20,25,21),(23,28,24),(28,35,29),(33,41,34)]
    for k in range(4):
        for j in range(5):
            cx=sx+rnd.uniform(-1.6,1.6)*s*(1-k*0.18); cy=sy-(h*0.55+rnd.uniform(-0.6,1.6)+k*0.35)*s; r=rnd.uniform(0.9,1.5)*s*(1-k*0.15)
            d.ellipse([cx-r,cy-r*0.8,cx+r,cy+r*0.8],fill=greens[k])
    im.alpha_composite(lay)

def escena(cam,luz=True,headlights=None):
    im=Image.new('RGBA',(W*K,H*K),C['bg']+(255,))
    sky(im); cerros(im,cam); suelo(im,cam)
    if headlights:
        lay=Image.new('RGBA',im.size,(0,0,0,0)); d=ImageDraw.Draw(lay)
        for hx in headlights:
            for k in range(8,0,-1):
                f=k/8
                pts=[cam.P(hx-0.6*f-0.06*(z-3),0,z) for z in np.linspace(3,3+20*f,10)]+[cam.P(hx+0.6*f+0.06*(z-3),0,z) for z in np.linspace(3+20*f,3,10)]
                d.polygon(pts,fill=(205,206,200,int(16*(1-f))+3))
        im.alpha_composite(lay)
    # edificios (lejos → cerca), todos mirando a la avenida
    capa=[('f','teresa-carreno',14,128),('f','catedral-de-barquisimeto',76,150),('f','biblioteca-ingenieria',-21,62),
          ('a',4,40,100),('a',5,-40,52),('a',6,25,56)]
    for it in sorted(capa,key=lambda t:-t[3]):      # painter: lejos → cerca (en Pixi: zIndex = −z)
        if it[0]=='f': place_fachada(im,cam,it[1],it[2],it[3],luz)
        else: arbol(im,cam,it[2],it[3],6.5,it[1])
    # mobiliario cercano
    for z in (46,47): pass
    seto(im,cam,-300,-10,ZX0-0.4); seto(im,cam,10,300,ZX0-0.4)
    for z in (40,22): place_farol(im,cam,-9.6,z,flip=False)
    for z in (38,22): place_farol(im,cam,10.0,z,flip=True)
    banco(im,cam,10.6,13); banco(im,cam,-10.6,17)
    for x in (-12,12): place_farol(im,cam,x,46.5,flip=(x>0))
    return im

# ---------------- JAC T9 · cabina (overlay en coordenadas de pantalla @1x) ----------------
def cabina(luces=True):
    im=Image.new('RGBA',(W*K,H*K),(0,0,0,0)); d=ImageDraw.Draw(im,'RGBA')
    S=lambda pts:[(x*K,y*K) for x,y in pts]
    ol=(58,61,68)
    def poly(pts,fill,line=ol,w=1):
        if fill: d.polygon(S(pts),fill=fill)
        if line: d.line(S(pts+[pts[0]]),fill=line,width=K*w,joint='curve')
    # vidrios laterales: tinte oscuro translúcido (deja ver la calle)
    poly([(0,40),(150,40),(98,330),(70,520),(58,600),(0,606)],(10,11,14,190),None)
    poly([(1068,44),(W,34),(W,612),(1218,604),(1172,584)],(10,11,14,190),None)
    # marco inferior de las ventanas laterales (línea de cintura de la puerta)
    poly([(0,520),(70,505),(66,540),(0,556)],(22,23,27),ol)
    poly([(1180,500),(W,488),(W,524),(1188,532)],(22,23,27),ol)
    # espejo lateral izquierdo (Graphite Grey), visto por el vidrio
    poly([(60,470),(96,462),(92,512),(64,516)],(30,32,36),(58,61,68))           # vela del espejo
    poly([(6,424),(74,412),(80,476),(10,490)],(52,54,60),(90,94,102))
    poly([(14,432),(66,422),(71,466),(17,478)],(16,18,22),None)
    d.line(S([(17,450),(69,440)]),fill=(58,61,68),width=K)
    # techo + parasoles
    poly([(0,0),(W,0),(W,34),(1040,46),(640,52),(240,46),(0,40)],(22,23,27))
    poly([(250,42),(560,47),(560,74),(262,70)],(30,32,36))
    poly([(720,47),(1010,43),(1000,68),(720,73)],(30,32,36))
    d.line(S([(0,40),(240,46),(640,52),(1040,46),(W,34)]),fill=(44,46,52),width=K)
    # pilares A: el izquierdo cerca (grueso), el derecho lejos (fino e inclinado)
    poly([(150,40),(252,46),(132,584),(60,600),(70,520),(98,330)],(26,28,32),ol)
    d.line(S([(238,50),(122,578)]),fill=(44,46,52),width=K)
    poly([(1040,46),(1070,44),(1174,584),(1144,588)],(26,28,32),ol)
    # plumillas en reposo sobre el arranque del capó
    for a,b in (((330,575),(690,568)),((738,569),(1050,574))):
        d.line(S([a,b]),fill=(10,11,13),width=K*4); d.line(S([(a[0],a[1]-2),(b[0],b[1]-2)]),fill=(40,42,47),width=K)
    # tablero: cara superior + frente + costura
    top=[(0,612),(60,596),(300,582),(640,576),(980,582),(1220,596),(W,610)]
    poly(top+[(W,H),(0,H)],(18,19,22),None)
    d.line(S(top),fill=(74,78,86),width=K)                                    # canto con luz de calle
    poly([(0,652),(330,630),(640,626),(950,630),(W,652),(W,H),(0,H)],(26,28,32),ol)
    d.line(S([(0,662),(330,640),(640,636),(950,640),(W,662)]),fill=(42,37,33),width=K)
    for (x0,x1) in ((24,150),(1130,1256)):                                      # rejillas
        y0=652-(x0<640)*0+0
        pts=[(x0,668),(x1,662),(x1,702),(x0,708)] if x0<640 else [(x0,662),(x1,668),(x1,708),(x0,702)]
        poly(pts,(14,15,18),ol)
        for i in range(1,5):
            d.line(S([(pts[0][0],pts[0][1]+i*8),(pts[1][0],pts[1][1]+i*8)]),fill=(40,42,47),width=K)
    # cuadro de instrumentos (visera + pantalla) — luz fría, un solo testigo ámbar
    poly([(476,598),(804,598),(826,624),(454,624)],(14,15,18),ol)
    poly([(490,624),(790,624),(790,690),(490,690)],(9,10,12),ol)
    d.line(S([(492,626),(788,626)]),fill=(40,44,52),width=K)                  # brillo del cuadro bajo la visera
    for cx,lab in ((566,0),(714,1)):
        r=28; cy=660
        d.arc([(cx-r)*K,(cy-r)*K,(cx+r)*K,(cy+r)*K],start=140,end=400,fill=(52,55,61),width=K*2)
        d.arc([(cx-r)*K,(cy-r)*K,(cx+r)*K,(cy+r)*K],start=140,end=205 if lab==0 else 250,fill=(150,154,162),width=K*2)
        for a in np.linspace(140,400,9):
            t=math.radians(a); d.line(S([(cx+math.cos(t)*(r-7),cy+math.sin(t)*(r-7)),(cx+math.cos(t)*(r-3),cy+math.sin(t)*(r-3))]),fill=(90,94,102),width=K)
    for i in range(4): d.rectangle([(624+i*9)*K,648*K,(630+i*9)*K-1,652*K],fill=(58,61,68))   # barras de marcha/combustible
    if luces: d.rectangle([634*K,674*K,646*K,678*K],fill=C['glow'])         # testigo de faros
    # pantalla central flotante (mapa en línea + punto ámbar = tu posición)
    poly([(880,594),(1090,586),(1094,684),(884,690)],(12,13,15),(70,74,82))
    for i in range(1,7): d.line(S([(890+i*28,596),(894+i*28,686)]),fill=(30,33,38),width=K)
    for j in range(1,4): d.line(S([(884,594+j*24),(1092,586+j*24)]),fill=(30,33,38),width=K)
    d.line(S([(900,672),(960,642),(1010,650),(1070,612)]),fill=(90,94,102),width=K)
    if luces: d.ellipse([956*K,638*K,964*K,646*K],fill=C['glow'])
    # volante (dona real: el hueco deja ver el cuadro)
    cx,cy,R,r=640,752,250,214
    d.ellipse([(cx-R)*K,(cy-R)*K,(cx+R)*K,(cy+R)*K],outline=(16,17,20),width=(R-r)*K)
    d.ellipse([(cx-R)*K,(cy-R)*K,(cx+R)*K,(cy+R)*K],outline=ol,width=K)
    d.ellipse([(cx-r)*K,(cy-r)*K,(cx+r)*K,(cy+r)*K],outline=ol,width=K)
    d.arc([(cx-R+7)*K,(cy-R+7)*K,(cx+R-7)*K,(cy+R-7)*K],start=215,end=325,fill=(78,82,90),width=K*2)   # filo de luz arriba del aro
    for ang in (196,344):
        t=math.radians(ang); a=(cx+math.cos(t)*(r+4),cy+math.sin(t)*(r+4)); b=(cx+math.cos(t)*80,cy+math.sin(t)*80)
        n=(-math.sin(t)*17,math.cos(t)*17)
        poly([(a[0]+n[0],a[1]+n[1]),(b[0]+n[0],b[1]+n[1]),(b[0]-n[0],b[1]-n[1]),(a[0]-n[0],a[1]-n[1])],(22,23,27),ol)
        d.line(S([(a[0]-n[0]*0.6,a[1]-n[1]*0.6),(b[0]-n[0]*0.6,b[1]-n[1]*0.6)]),fill=(40,42,47),width=K)
    d.ellipse([(cx-88)*K,(cy-88)*K,(cx+88)*K,(cy+88)*K],fill=(22,23,27),outline=ol,width=K)
    d.ellipse([(cx-64)*K,(cy-64)*K,(cx+64)*K,(cy+64)*K],fill=(28,30,34),outline=(44,46,52),width=K)
    # insignia JAC: solo el texto, cromo apagado
    px=3; x0=cx-(3*5*px+2*2*px)//2; y0=cy-58
    for i,ch in enumerate('JAC'):
        for rr,row in enumerate(FONT[ch]):
            for cc,bit in enumerate(row):
                if bit=='1':
                    X=x0+i*(7*px)+cc*px; Y=y0+rr*px; d.rectangle([X*K,Y*K,(X+px)*K-1,(Y+px)*K-1],fill=(150,154,162))
    # retrovisor: ventana trasera con la barra antivuelco del platón y las cabeceras
    d.rectangle([872*K,48*K,884*K,70*K],fill=(30,32,36))
    poly([(800,68),(960,64),(964,116),(804,120)],(30,32,36),(90,94,102))
    poly([(810,74),(952,70),(955,110),(813,114)],(13,14,17),None)
    d.polygon(S([(822,108),(840,80),(924,78),(944,104)]),fill=(24,26,31))
    d.line(S([(828,106),(846,84),(918,82),(938,104)]),fill=(78,82,90),width=K*2)
    d.line(S([(846,84),(852,104)]),fill=(78,82,90),width=K); d.line(S([(918,82),(912,104)]),fill=(78,82,90),width=K)
    poly([(842,96),(862,94),(862,112),(842,113)],(26,28,32),None); poly([(904,94),(924,93),(924,111),(904,112)],(26,28,32),None)
    return im,(cx,cy,r)
def capo(im,cam,xc):
    """Capó Graphite Grey (y=1.16 m) visto desde el puesto: hombros de guardafango, domo central con biseles, filo delantero."""
    lay=Image.new('RGBA',im.size,(0,0,0,0)); d=ImageDraw.Draw(lay,'RGBA')
    y=1.16; zf=2.75; zb=1.0; hw=0.98
    def Pp(x,z,yy=y): return cam.P(x,yy,z)
    def band(z0,z1,x0,x1,col,yy=y): d.polygon([Pp(x0,z0,yy),Pp(x1,z0,yy),Pp(x1,z1,yy),Pp(x0,z1,yy)],fill=col)
    # superficie: tres bandas planas (reflejo del cielo más claro adelante), bordes rectos compartidos
    for z0,z1,col in ((zf,2.45,(50,52,58)),(2.45,1.9,(44,46,51)),(1.9,zb,(39,41,46))): band(z0,z1,-hw+xc,hw+xc,col)
    # hombros (guardafangos) un poco más altos y claros a cada lado
    for s_ in (-1,1):
        xa,xb=(xc+s_*0.80,xc+s_*hw) if s_>0 else (xc-hw,xc-0.80)
        band(zf,zb,xa,xb,(54,56,62),y+0.025)
        d.line([Pp(xc+s_*0.80,zf,y+0.025),Pp(xc+s_*0.80,zb,y+0.025)],fill=(30,32,36),width=K)   # pliegue (sombra)
    # domo central: tapa + bisel izquierdo iluminado + bisel derecho en sombra
    dy=0.045; dw0,dw1=0.34,0.44
    d.polygon([Pp(xc-dw0,zf-0.03,y+dy),Pp(xc+dw0,zf-0.03,y+dy),Pp(xc+dw1,zb,y+dy),Pp(xc-dw1,zb,y+dy)],fill=(50,52,58))
    d.polygon([Pp(xc-dw0-0.05,zf-0.03),Pp(xc-dw0,zf-0.03,y+dy),Pp(xc-dw1,zb,y+dy),Pp(xc-dw1-0.05,zb)],fill=(45,47,53))
    d.polygon([Pp(xc+dw0,zf-0.03,y+dy),Pp(xc+dw0+0.05,zf-0.03),Pp(xc+dw1+0.05,zb),Pp(xc+dw1,zb,y+dy)],fill=(32,34,38))
    d.polygon([Pp(xc-dw0,zf-0.03,y+dy),Pp(xc+dw0,zf-0.03,y+dy),Pp(xc+dw0+0.01,2.45,y+dy),Pp(xc-dw0-0.01,2.45,y+dy)],fill=(57,59,65))  # reflejo del cielo
    d.line([Pp(xc-dw0,zf-0.03,y+dy),Pp(xc+dw0,zf-0.03,y+dy)],fill=(96,100,108),width=K)
    # contorno y filo delantero
    d.line([Pp(xc-hw,zf,y+0.025),Pp(xc-hw,zb,y+0.025)],fill=(90,94,102),width=K)
    d.line([Pp(xc+hw,zf,y+0.025),Pp(xc+hw,zb,y+0.025)],fill=(90,94,102),width=K)
    d.line([Pp(xc-hw,zf,y+0.025),Pp(xc-0.74,zf,y+0.012),Pp(xc+0.74,zf,y+0.012),Pp(xc+hw,zf,y+0.025)],fill=(112,116,124),width=K)
    # reflejos fríos de los faroles de la avenida (trazos cortos sobre el hombro, no manchas)
    for xo,z0,z1 in ((-0.89,2.65,2.3),(0.89,2.6,2.35)):
        d.line([Pp(xc+xo,z0,y+0.026),Pp(xc+xo,z1,y+0.026)],fill=(96,100,108),width=K*2)
    im.alpha_composite(lay)

def amber_share(img):
    a=np.asarray(img.convert('RGBA')).astype(int); al=a[...,3]>20
    r,g,b=a[...,0],a[...,1],a[...,2]
    amb=al&(r>90)&(r-b>55)&(g>b)&(r>=g)
    return amb.sum()/max(1,al.sum())

def finish(img,base):
    i2=img.resize((W*2,H*2),Image.LANCZOS); i1=img.resize((W,H),Image.LANCZOS)
    i2.convert('RGB').save(f'{base}@2x.png'); i1.convert('RGB').save(f'{base}@1x.png'); return i1,i2

def piezas():
    os.makedirs(f'{OUT}/piezas',exist_ok=True); info={}
    for key,f in FACH.items():
        for luz in (True,False):
            w=int(math.ceil((f['u1']-f['u0'])*PPM)); h=int(math.ceil(f['v1']*PPM))+2
            im=Image.new('RGBA',(w*K,h*K),(0,0,0,0)); ox=-f['u0']*PPM*K; oy=(h-1)*K
            pn=Pn(im,ox,oy,PPM*K); f['fn'](pn,luz)
            nm=f"fachada-{key}__luz-{'encendida' if luz else 'apagada'}"
            im.resize((w*2,h*2),Image.LANCZOS).save(f'{OUT}/piezas/{nm}@2x.png'); i1=im.resize((w,h),Image.LANCZOS); i1.save(f'{OUT}/piezas/{nm}@1x.png')
            info[nm]=dict(w=w,h=h,ancla=[int(round(-f['u0']*PPM)),h-1],ambar_pct=round(amber_share(i1)*100,2))
    # farol de frente
    w,h=24,76; im=Image.new('RGBA',(w*K,h*K),(0,0,0,0)); pn=Pn(im,6*K,(h-1)*K,PPM*K); farol(pn,True)
    im.resize((w*2,h*2),Image.LANCZOS).save(f'{OUT}/piezas/farol-frente__estado-encendido@2x.png'); i1=im.resize((w,h),Image.LANCZOS); i1.save(f'{OUT}/piezas/farol-frente__estado-encendido@1x.png')
    info['farol-frente__estado-encendido']=dict(w=w,h=h,ancla=[6,h-1],ambar_pct=round(amber_share(i1)*100,2))
    # cielo tileable (2048 × 400 @1x): degradado + estrellas con envoltura horizontal
    TWd,THd=2048,400; im=Image.new('RGB',(TWd,THd)); d=ImageDraw.Draw(im)
    for y in range(THd): d.line([(0,y),(TWd,y)],fill=lerp((8,9,11),(30,32,39),(min(1,y/HZ))**1.6))
    rnd=random.Random(21)
    for i in range(420):
        x=rnd.randrange(TWd); y=int(rnd.uniform(0,HZ*0.78)); b=rnd.random(); c=C['text'] if b>0.93 else C['text2'] if b>0.6 else (70,74,82)
        d.point((x,y),fill=c)
        if b>0.97: d.point(((x+1)%TWd,y),fill=c); d.point((x,y+1),fill=c); d.point(((x+1)%TWd,y+1),fill=c)
    im.save(f'{OUT}/piezas/cielo-noche__tile@1x.png'); im.resize((TWd*2,THd*2),Image.NEAREST).save(f'{OUT}/piezas/cielo-noche__tile@2x.png')
    info['cielo-noche__tile']=dict(w=TWd,h=THd,ancla=[0,HZ],ambar_pct=0.0)
    # franjas de suelo (sección transversal de la avenida, 2 fases para dar velocidad)
    for fase in ('a','b'):
        w=512; h=8; im=Image.new('RGB',(w,h),C['grass']); d=ImageDraw.Draw(im)
        m=lambda x: int((x+16)/32*w)   # −16..+16 m → 0..512
        d.rectangle([m(-9.5),0,m(9.5),h],fill=C['propFace']); d.rectangle([m(-5.25),0,m(5.25),h],fill=C['propLine'])
        d.rectangle([m(-5),0,m(5),h],fill=(22,23,27))
        for s_ in (-1,1): d.line([(m(s_*4.6),0),(m(s_*4.6),h)],fill=(58,61,68))
        if fase=='a': d.rectangle([m(-0.08),0,m(0.08),h],fill=(120,124,132))
        else:
            for s_ in (-1,1): d.line([(m(s_*5.25),0),(m(s_*9.5),0)],fill=C['tileLine'])
        im.save(f'{OUT}/piezas/suelo-avenida__fase-{fase}@1x.png'); im.resize((w*2,h*2),Image.NEAREST).save(f'{OUT}/piezas/suelo-avenida__fase-{fase}@2x.png')
        info[f'suelo-avenida__fase-{fase}']=dict(w=w,h=h,ancla=[256,0],ambar_pct=0.0)
    return info

if __name__=='__main__':
    os.makedirs(f'{OUT}/frames',exist_ok=True); os.makedirs(f'{OUT}/piezas',exist_ok=True)
    rep={}
    # (a) a pie: Adonay en la acera derecha, ojo a 1,78 m
    camA=Cam(7.2,1.78); fa=escena(camA,True)
    a1,a2=finish(fa,f'{OUT}/frames/frame-a-a-pie'); rep['frame-a-a-pie']=round(amber_share(a1)*100,2)
    # (b) JAC T9, puesto del conductor (carril derecho, volante a la izquierda): ojo a 1,45 m
    xc=2.6; camB=Cam(xc-0.37,1.45)
    fb=escena(camB,True,headlights=[xc-0.75,xc+0.75]); capo(fb,camB,xc)
    cp=Image.new('RGBA',(W*K,H*K),(0,0,0,0)); capo(cp,camB,xc)          # capó como overlay fijo a la cámara
    cp.resize((W*2,H*2),Image.LANCZOS).save(f'{OUT}/piezas/jac-t9-capo@2x.png'); cp.resize((W,H),Image.LANCZOS).save(f'{OUT}/piezas/jac-t9-capo@1x.png')
    cab,(wx,wy,wr)=cabina(True)
    # hueco del volante: lo que está detrás se ve (el overlay es transparente ahí); rellenamos el tablero detrás del aro
    fb.alpha_composite(cab)
    b1,b2=finish(fb,f'{OUT}/frames/frame-b-jac-t9')
    rep['frame-b-jac-t9']=round(amber_share(b1)*100,2)
    cab.resize((W*2,H*2),Image.LANCZOS).save(f'{OUT}/piezas/jac-t9-cabina__luces-on@2x.png'); c1=cab.resize((W,H),Image.LANCZOS); c1.save(f'{OUT}/piezas/jac-t9-cabina__luces-on@1x.png')
    rep['jac-t9-cabina__luces-on (opacos)']=round(amber_share(c1)*100,2)
    rep['piezas']=piezas()
    json.dump(rep,open(f'{OUT}/src/ambar.json','w'),indent=1,ensure_ascii=False)
    print(json.dumps({k:v for k,v in rep.items() if k!='piezas'},indent=1)); print(json.dumps(rep['piezas'],indent=1))
