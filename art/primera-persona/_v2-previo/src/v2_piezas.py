# Primera persona v2 (BORRADOR) · fachadas frontales nuevas + props + Ávila + suelos. Alzados en metros (Pn: u=0 centro, v=0 suelo).
import math, random
import numpy as np
from PIL import Image, ImageDraw
import build_primera_persona as B
C=B.C; K=B.K; OLc=C['propLine']
WARM=C['warm']; DIM=C['dim']; GLASS=C['glass']; GLOW=C['glow']
EDGE=(14,15,17)
G1,G2,G3=(23,28,24),(34,43,36),(52,64,58)        # verdes estilo C (grass + pasos charcoal apenas verdes)
def ell(pn,cx,cy,rx,ry,fill,line=None,w=1.0):
    a=pn.p(cx-rx,cy+ry); b=pn.p(cx+rx,cy-ry)
    pn.d.ellipse([min(a[0],b[0]),min(a[1],b[1]),max(a[0],b[0]),max(a[1],b[1])],fill=fill,outline=line,width=max(1,int(pn.lw*w)) if line else 0)
def window4(pn,u0,v0,u1,v1,lit,warm_panes=(1,)):
    """ventana de 4 hojas; encendida = relleno tibio apagado (no cuenta) y solo algunas hojas tibias"""
    pn.rect(u0,v0,u1,v1,DIM if lit else GLASS,OLc,0.8)
    if lit:
        um,vm=(u0+u1)/2,(v0+v1)/2
        q=[(u0,vm,um,v1),(um,vm,u1,v1),(u0,v0,um,vm),(um,v0,u1,vm)]
        for i in warm_panes: a,b,c,d=q[i]; pn.rect(a+0.06,b+0.06,c-0.06,d-0.06,WARM,None)
    pn.line([((u0+u1)/2,v0),((u0+u1)/2,v1)],OLc,0.6); pn.line([(u0,(v0+v1)/2),(u1,(v0+v1)/2)],OLc,0.6)
def door(pn,u0,u1,h,lit,double=False):
    pn.rect(u0,0,u1,h,GLASS,OLc,0.8)
    if double: pn.line([((u0+u1)/2,0),((u0+u1)/2,h)],OLc,0.6)
    if lit: pn.rect(u1-0.16,0.05,u1-0.06,h-0.05,GLOW,None)          # canto de luz de la puerta (como el iso)

# ---------------- Flor de Venezuela (pabellón de Fruto Vivas) ----------------
def flor(pn,luz=True):
    ol=OLc; rnd=random.Random(4)
    # pétalos traseros (abanico alto) — se dibujan antes que el tambor
    def petal(ang,L,wd,base=(0,7.6),col=(70,73,80),rib=(48,50,56),edge=(116,120,128),droop=0.18):
        t=math.radians(ang); ux,uy=math.cos(t),math.sin(t); nx,ny=-uy,ux
        pts_l=[];pts_r=[]
        for k in range(13):
            s=k/12; w=wd*math.sin(math.pi*min(1,s*1.08))**0.8*(1-0.25*s)
            dx=ux*L*s; dy=uy*L*s-droop*L*s*s*abs(ux)            # la punta cae hacia afuera, como el iso
            pts_l.append((base[0]+dx+nx*w/2,base[1]+dy+ny*w/2)); pts_r.append((base[0]+dx-nx*w/2,base[1]+dy-ny*w/2))
        pn.poly(pts_l+pts_r[::-1],col,None)
        half=[(base[0]+ux*L*k/12,base[1]+uy*L*k/12-droop*L*(k/12)**2*abs(ux)) for k in range(13)]
        pn.poly(pts_l+half[::-1],tuple(min(255,c+10) for c in col),None)   # mitad iluminada
        pn.line(half,rib,0.6); pn.line(pts_l+pts_r[::-1]+[pts_l[0]],edge,0.7)
    for ang in (100,80,122,58,144,36,166,14):
        petal(ang,12.5 if 30<ang<150 else 11.0,4.4,col=(58,61,68),rib=(40,42,47),edge=(96,100,108))
    for ang in (90,112,68,134,46,156,24):
        petal(ang,11.2,4.8,base=(0,7.2),col=(80,84,92),rib=(52,55,61),edge=(132,136,144))
    # núcleo: celosía + farol octogonal (luz)
    pn.rect(-1.5,7.2,1.5,11.4,(30,32,36),ol,0.6)
    for v in np.arange(7.2,11.2,1.05): pn.line([(-1.5,v),(1.5,v+1.05)],(58,61,68),0.5); pn.line([(1.5,v),(-1.5,v+1.05)],(58,61,68),0.5)
    oc=[(1.7*math.cos(math.radians(a)),12.1+0.75*math.sin(math.radians(a))) for a in range(22,382,45)]
    pn.poly(oc,GLOW if luz else C['tileLine'],ol,0.8)
    if luz:
        lay=Image.new('RGBA',pn.im.size,(0,0,0,0)); dl=ImageDraw.Draw(lay); cx,cy=pn.p(0,12.1)
        for f,a in ((7.0,8),(4.6,12),(2.8,18)): r=f*pn.s; dl.ellipse([cx-r,cy-r*0.7,cx+r,cy+r*0.7],fill=(255,181,71,a))
        pn.im.alpha_composite(lay); pn.refresh()
    # plinto escalonado con bolardos + tambor
    pn.rect(-20,0,20,0.6,C['tileSide'],ol)
    for u in np.arange(-19,19.5,2.4): pn.rect(u,0.15,u+0.9,0.42,(30,32,36),None)
    pn.rect(-16.5,0.6,16.5,1.2,C['propFace'],ol)
    pn.rect(-12.5,1.2,12.5,6.6,(19,20,23),ol)
    pn.rect(-13,6.6,13,7.2,C['tileTop'],ol); pn.hline(-12.5,12.5,6.2,C['tileLine'])
    for i,u in enumerate(np.arange(-11.6,11.7,1.6)):           # banda de ventanas (pocas encendidas)
        lit=luz and (i%3==1)
        pn.rect(u,4.7,u+0.8,5.5,WARM if lit else GLASS,(40,42,47),0.5)
    for i,u in enumerate((-9.4,-5.8,5.0,8.6)):
        pn.rect(u,2.6,u+0.8,3.3,(DIM if luz else GLASS),(40,42,47),0.5)
    pn.rect(-1.4,1.2,1.4,4.1,GLOW if luz else GLASS,C['shell'],0.8); pn.line([(0,1.2),(0,4.1)],WARM if luz else C['tileSide'],0.6)
    # pétalos delanteros que caen sobre el borde del tambor
    for ang in (-62,-118,-90):
        petal(ang,3.4,3.2,base=(0,8.6),col=(84,88,96),rib=(52,55,61),edge=(132,136,144),droop=0.0)

# ---------------- Sambil Barquisimeto ----------------
def sambil(pn,luz=True):
    ol=OLc
    # carpas tensadas (conos blancos con mástil) detrás del cuerpo
    cones=[(-15,27.5,10),(15,26.5,10),(-7,31,11),(7,30,11),(0,26,9)]
    for cx,hp,hw in cones:
        L=[(cx-hw+ (hw*(1-(1-s)**1.8)),15+(hp-15)*s) for s in np.linspace(0,1,14)]
        R=[(cx+hw-(hw*(1-(1-s)**1.8)),15+(hp-15)*s) for s in np.linspace(0,1,14)]
        pn.poly(L+R[::-1],(84,88,96),None)
        pn.poly([(cx,15)]+[(cx,hp)]+R[::-1][1:],(66,69,76),None)     # mitad en sombra
        pn.line(L,(128,132,140),0.7); pn.line(R,(96,100,108),0.7)
        for s in (0.35,0.6): pn.line([(cx-hw*(1-s)**0.9,15+(hp-15)*s*0.95),(cx+hw*(1-s)**0.9,15+(hp-15)*s*0.95)],(74,77,84),0.5)
        pn.line([(cx,hp),(cx,hp+3.6)],C['propLine'],0.7)
    pn.line([(-15,31.1),(-7,34.6),(0,29.6),(7,33.6),(15,30.1)],(90,94,102),0.5)       # cables entre mástiles
    pn.rect(-24,15,24,15.8,(62,50,38),None)                                            # anillo de la carpa (madera apagada)
    # cuerpo principal
    pn.rect(-42,0,42,15,C['tileSide'],ol)
    for v in (5.2,10.2): pn.hline(-42,42,v,C['tileLine'])
    for u in np.arange(-40,41,6): pn.line([(u,0.4),(u,14.6)],(24,25,29),0.5)
    # anclas laterales
    pn.rect(-40,0,-21,12.5,C['tileTop'],ol); pn.rect(21,0,40,12.5,C['tileTop'],ol)
    pn.rect(-21,0,-16,9,C['propFace'],ol); pn.rect(16,0,21,9,C['propFace'],ol)
    for s_ in (-1,1):
        a,b=(-38,-23) if s_<0 else (23,38)
        pn.rect(a,8.6,b,9.4,GLASS,None)
        for k,u in enumerate(np.arange(a+1,b-1,2.6)):
            if luz and k==2: pn.rect(u,8.7,u+1.2,9.3,DIM,None)
    # entrada: frente curvo + marquesina + 5 vidrieras altas encendidas (franja tibia fina)
    top=[(u,11+1.2*(1-(u/14)**2)) for u in np.linspace(-14,14,21)]
    pn.poly([(-14,0)]+top+[(14,0)],C['propFace'],ol)
    pn.rect(-12.5,7.0,12.5,9.6,GLASS,(40,42,47),0.6)
    for u in np.arange(-12.5,12.6,2.5): pn.line([(u,7.0),(u,9.6)],(36,38,43),0.5)
    for i,u in enumerate(np.arange(-11,11.1,5.5)[:5] if False else (-11,-6,-1,4,9)):
        pn.rect(u,0.4,u+2,5.3,DIM if luz else GLASS,(40,42,47),0.6)
        if luz: pn.rect(u+0.85,0.6,u+1.15,5.1,GLOW,None)
    pn.poly([(-13.5,5.6),(13.5,5.6),(12.8,6.5),(-12.8,6.5)],C['tileLine'],ol,0.8)
    for u in (-11.6,-6.6,-1.6,3.4,8.4,12.4): pn.line([(u,0),(u,5.6)],C['propLine'],0.7)

# ---------------- Estudio (6×6) ----------------
def estudio(pn,luz=True):
    ol=OLc
    pn.rect(-2.6,5.3,2.6,5.8,C['propFace'],ol,0.8)                   # lucernario que asoma
    pn.rect(5.4,5.3,6.6,5.6,C['propFace'],ol,0.8)                    # ducto
    for a in (-7.6,2.8): pn.rect(a,5.3,a+2.4,5.55,(30,38,32),ol,0.6)  # jardineras del techo
    pn.rect(-9,0,9,4.6,C['propFace'],ol)
    pn.rect(-9,0,9,0.35,C['tileLine'],None)
    pn.rect(-9.15,4.6,9.15,5.3,C['tileLine'],ol)
    pn.hline(-9,9,4.3,(44,47,53))
    for u in (-6,-3,0,3,6): pn.rect(u-0.08,0.35,u+0.08,4.3,(44,47,53),None)
    bays=[('w',False),('w',True),('p',False),('d',True),('w',True),('w',False)]
    for i,(k,lit) in enumerate(bays):
        u0=-9+3*i
        if k=='w': window4(pn,u0+0.8,1.3,u0+2.2,3.2,luz and lit,(0,))
        elif k=='p': pn.rect(u0+1.0,2.0,u0+2.0,2.6,C['tileTop'],ol,0.6); pn.hline(u0+1.15,u0+1.85,2.3,C['tileLine'])
        else:
            door(pn,u0+0.6,u0+2.4,2.45,luz,double=True)
            pn.rect(u0+0.3,2.6,u0+2.7,2.85,C['propFace'],ol,0.8)      # marquesina
            if luz: pn.rect(u0+1.42,2.52,u0+1.58,2.6,GLOW,None)       # foco
            pn.rect(u0+0.4,-0.01,u0+2.6,0.15,C['tileLine'],ol,0.5)    # escalón

# ---------------- Casas de caso (12 m de frente) ----------------
def casa_volaris(pn,luz=True):
    ol=OLc
    pn.rect(3.3,3.4,4.7,9.0,C['tileSide'],ol)                        # torre de control
    pn.poly([(2.4,9.0),(5.6,9.0),(5.9,10.5),(2.1,10.5)],GLASS,ol,0.8)
    if luz:
        pn.poly([(2.5,9.1),(5.5,9.1),(5.75,10.4),(2.25,10.4)],DIM,None)
        for u in (2.9,3.8): pn.rect(u,9.25,u+0.6,10.25,WARM,None)
    for u in (3.0,4.0,5.0): pn.line([(u,9.0),(u+(0.15 if u>4 else -0.1 if u<4 else 0),10.5)],OLc,0.5)
    pn.rect(1.9,10.5,6.1,10.85,C['propFace'],ol,0.8); pn.line([(4,10.85),(4,11.8)],OLc,0.6)
    pn.rect(1.6,0,6,3.4,C['propFace'],ol)                            # terminal baja
    pn.rect(1.6,3.4,6,3.7,C['tileLine'],ol,0.6)
    pn.rect(2.2,1.5,5.6,2.6,GLASS,ol,0.6)
    for u in (3.05,3.9,4.75): pn.line([(u,1.5),(u,2.6)],OLc,0.5)
    # hangar: bóveda de cañón vista de frente (abanico de vidrio + paneles)
    arc=[(-2.2+4.0*math.cos(t),2.2+4.0*math.sin(t)) for t in np.linspace(0,math.pi,40)]
    pn.poly([(1.8,0)]+arc+[(-6.2,0)],C['tileTop'],ol)
    fan=[(-2.2+3.3*math.cos(t),2.4+3.3*math.sin(t)) for t in np.linspace(0,math.pi,30)]
    pn.poly(fan+[(-5.5,2.4)],GLASS,ol,0.7)
    for t in np.linspace(0,math.pi,9)[1:-1]: pn.line([(-2.2,2.4),(-2.2+3.3*math.cos(t),2.4+3.3*math.sin(t))],OLc,0.5)
    pn.hline(-6.2,1.8,2.2,C['tileLine'],0.6)
    for u in np.arange(-5.6,1.4,0.8): pn.line([(u,0.2),(u,2.2)],(30,32,36),0.5)
    door(pn,-2.8,-1.6,2.1,luz); pn.rect(-3.1,2.2,-1.3,2.45,C['propFace'],ol,0.7)
    if luz: pn.rect(-2.27,2.12,-2.13,2.2,GLOW,None)
def casa_bain(pn,luz=True):
    ol=OLc
    pn.rect(-2.4,11.4,2.4,12.3,C['propFace'],ol,0.8)                 # sala de máquinas
    for v in (11.7,12.0): pn.hline(-2.3,2.3,v,C['tileLine'],0.5)
    pn.rect(-6,0,6,4,C['propFace'],ol); pn.rect(-6,4,6,10.8,C['tileSide'],ol)
    pn.rect(-6.1,10.8,6.1,11.4,C['tileLine'],ol); pn.rect(-6,3.8,6,4.2,C['tileLine'],None)
    # muro cortina en grilla (2 pisos) con 2 oficinas encendidas en esta cara
    us=np.linspace(-5.6,5.6,13); vs=np.linspace(4.6,10.4,7)
    pn.rect(-5.6,4.6,5.6,10.4,GLASS,None)
    if luz:
        for (i,j) in ((2,4),(3,4),(8,1),(9,1)): pn.rect(us[i]+0.05,vs[j]+0.05,us[i+1]-0.05,vs[j+1]-0.05,WARM if (i+j)%2 else DIM,None)
    for u in us: pn.line([(u,4.6),(u,10.4)],OLc,0.5)
    for v in vs: pn.hline(-5.6,5.6,v,OLc,0.5)
    # basamento con vestíbulo
    for a,b in ((-5.4,-1.2),(1.2,5.4)):
        pn.rect(a,0.6,b,3.3,GLASS,ol,0.6)
        for u in np.linspace(a,b,4)[1:-1]: pn.line([(u,0.6),(u,3.3)],OLc,0.5)
    door(pn,-0.6,0.6,2.4,luz); pn.rect(-1.0,2.55,1.0,2.8,C['propFace'],ol,0.7)
    if luz: pn.rect(-0.07,2.47,0.07,2.55,GLOW,None)
def casa_mentoria(pn,luz=True):
    ol=OLc
    # techo a dos aguas de madera (alero visto de frente)
    pn.poly([(-6.6,3.2),(6.6,3.2),(5.4,6.4),(-5.4,6.4)],C['wood'],ol)
    for v in (3.9,4.6,5.3,6.0): pn.hline(-6.6+(v-3.2)*0.375,6.6-(v-3.2)*0.375,v,(56,49,43),0.5)
    pn.rect(-6.6,3.05,6.6,3.25,(30,27,25),None)
    pn.rect(-5.8,0,5.8,3.1,C['propFace'],ol)
    # ventanal encendido con caballete a contraluz
    pn.rect(-5.0,0.7,-1.4,2.6,DIM if luz else GLASS,ol,0.7)
    if luz:
        pn.rect(-4.9,1.75,-3.3,2.5,WARM,None)
        pn.line([(-3.6,0.75),(-3.0,2.3),(-2.4,0.75)],(30,27,25),1.0); pn.line([(-3.0,2.3),(-3.0,0.75)],(30,27,25),0.7)
        pn.rect(-3.5,1.5,-2.5,2.1,(40,34,28),None)
    for u in (-3.8,-2.6): pn.line([(u,0.7),(u,2.6)],OLc,0.5)
    door(pn,0.4,1.5,2.3,luz)
    window4(pn,3.0,1.2,4.6,2.5,False)
    # porche con pérgola + 2 bancos
    for u in (-5.9,-0.9,4.1): pn.rect(u-0.1,0,u+0.1,2.75,C['wood'],ol,0.6)
    pn.rect(-6.3,2.75,4.5,2.95,C['wood'],ol,0.6)
    for u in np.arange(-6.0,4.4,0.7): pn.rect(u,2.95,u+0.12,3.05,(56,49,43),None)
    for a in (-4.6,-2.4):
        pn.rect(a,0.42,a+1.4,0.52,C['wood'],ol,0.5); pn.rect(a+0.1,0,a+0.2,0.42,C['tileSide'],None); pn.rect(a+1.2,0,a+1.3,0.42,C['tileSide'],None)
    pn.rect(-6.6,-0.01,4.8,0.12,(40,36,32),None)
def casa_finoa(pn,luz=True):
    ol=OLc; rnd=random.Random(3)
    pn.rect(-4,6.4,3.2,8.6,C['propFace'],ol)                         # volumen retranqueado
    pn.rect(-3.4,7.1,2.6,7.9,GLASS,ol,0.5)
    if luz: pn.rect(-1.6,7.2,-0.2,7.8,WARM,None)
    pn.rect(-6,1.0,6,6.4,C['tileSide'],ol)                           # volumen cerrado
    for v in (5.0,5.45,5.9): pn.rect(-5.6,v,3.2,v+0.22,(14,15,17),None)   # cintas horizontales
    pn.rect(-6.1,6.4,6.1,6.7,C['tileLine'],ol,0.6)
    pn.rect(3.6,1.0,5.6,7.2,GLASS,ol,0.7)                            # caja de escalera de vidrio
    for v in np.arange(1.6,7.0,0.7): pn.hline(3.6,5.6,v,OLc,0.4)
    if luz: pn.line([(3.8,1.4),(5.4,3.4)],(60,63,70),0.6); pn.line([(5.4,3.6),(3.8,5.6)],(60,63,70),0.6)
    pn.rect(-6,0,6,1.0,C['tileTop'],ol)                              # zócalo de granito
    for _ in range(40): u=rnd.uniform(-5.8,5.8); v=rnd.uniform(0.15,0.85); pn.rect(u,v,u+0.08,v+0.06,(52,55,61),None)
    # puerta redonda de bóveda (volante y pernos, sin ámbar)
    ell(pn,-2.4,3.3,1.75,1.75,C['tileTop'],OLc,0.9); ell(pn,-2.4,3.3,1.35,1.35,EDGE,(70,74,82),0.7)
    for a in range(0,360,30): t=math.radians(a); ell(pn,-2.4+1.55*math.cos(t),3.3+1.55*math.sin(t),0.07,0.07,(90,94,102))
    for a in (90,210,330): t=math.radians(a); pn.line([(-2.4,3.3),(-2.4+0.8*math.cos(t),3.3+0.8*math.sin(t))],(110,114,122),0.9)
    ell(pn,-2.4,3.3,0.22,0.22,(110,114,122))
    for v in np.arange(1.6,4.8,0.55): pn.rect(1.0,v,2.2,v+0.3,(14,15,17),OLc,0.4)   # rejillas verticales
def casa_pg(pn,luz=True):
    ol=OLc
    pn.rect(3.6,4,4.6,9.2,C['tileTop'],ol); pn.rect(3.4,9.2,4.8,9.6,C['propFace'],ol,0.8); pn.rect(3.75,9.5,4.45,9.6,EDGE,None)
    for v in np.arange(5,9,1.0): pn.hline(3.6,4.6,v,C['tileLine'],0.4)
    # techo en diente de sierra (3 dientes, vidrio en la cara vertical)
    for i in range(3):
        x0=-6+4*i
        pn.poly([(x0,4.0),(x0,6.0),(x0+4,4.0)],C['propFace'],ol)
        pn.rect(x0,4.05,x0+0.28,5.95,(DIM if (luz and i==1) else GLASS),None)
    pn.rect(-6,0,6,4,C['propFace'],ol); pn.rect(-6,3.8,6,4.05,C['tileLine'],None)
    # frente de tienda: vitrina encendida + toldo a rayas + puerta
    pn.rect(-5.2,0.6,-1.6,2.5,DIM if luz else GLASS,ol,0.7)
    if luz:
        for u in (-4.9,-3.6): pn.rect(u,1.6,u+0.9,2.4,WARM,None)
        for u in (-4.6,-3.2,-2.4): pn.rect(u,0.7,u+0.5,1.1+0.3*(u>-3),(40,34,28),None)   # productos a contraluz
    door(pn,-0.6,0.8,2.4,luz)
    k=0
    for u in np.arange(-5.6,1.2,0.6):
        pn.poly([(u,2.75),(u+0.6,2.75),(u+0.66,3.35),(u+0.06,3.35)],(58,61,68) if k%2 else (34,36,41),None); k+=1
    pn.line([(-5.6,2.75),(1.2,2.75)],OLc,0.6)
    for a in (2.4,4.0): window4(pn,a,1.2,a+1.3,2.6,False)

FACH2={'flor-de-venezuela':dict(fn=flor,u0=-21.2,u1=21.2,v1=20.4,m=(42.4,20.4),nombre='Flor de Venezuela (pabellón)',iso='exteriores/flor-de-venezuela/flor-de-venezuela__estado-default_zoom-cerca@1x.png'),
       'sambil-barquisimeto':dict(fn=sambil,u0=-42.2,u1=42.2,v1=34.8,m=(84.4,34.8),nombre='Sambil Barquisimeto (centro comercial)',iso='exteriores/sambil-barquisimeto/sambil-barquisimeto__estado-default_zoom-cerca@1x.png'),
       'estudio-6x6':dict(fn=estudio,u0=-9.3,u1=9.3,v1=5.9,m=(18.6,5.9),nombre='Estudio de Adonay (6×6)',iso='exteriores/estudio-6x6/estudio-6x6__estado-exterior_zoom-cerca@1x.png'),
       'casa-volaris':dict(fn=casa_volaris,u0=-6.4,u1=6.4,v1=12.0,m=(12.8,12.0),nombre='Casa Volaris',iso='exteriores/casas-caso/volaris/casa-volaris__caso-volaris_estado-exterior_zoom-cerca@1x.png'),
       'casa-bain':dict(fn=casa_bain,u0=-6.3,u1=6.3,v1=12.4,m=(12.6,12.4),nombre='Casa Bain',iso='exteriores/casas-caso/bain/casa-bain__caso-bain_estado-exterior_zoom-cerca@1x.png'),
       'casa-mentoria':dict(fn=casa_mentoria,u0=-6.8,u1=6.8,v1=6.6,m=(13.6,6.6),nombre='Casa Mentoría',iso='exteriores/casas-caso/mentoria/casa-mentoria__caso-mentoria_estado-exterior_zoom-cerca@1x.png'),
       'casa-finoa':dict(fn=casa_finoa,u0=-6.3,u1=6.3,v1=8.8,m=(12.6,8.8),nombre='Casa Finoa',iso='exteriores/casas-caso/finoa/casa-finoa__caso-finoa_estado-exterior_zoom-cerca@1x.png'),
       'casa-pg':dict(fn=casa_pg,u0=-6.3,u1=6.3,v1=9.8,m=(12.6,9.8),nombre='Casa P&G',iso='exteriores/casas-caso/pg/casa-pg__caso-pg_estado-exterior_zoom-cerca@1x.png')}

# ---------------- props ----------------
def arbol_c(pn,seed=5):
    """cují estilo C (racimos de hojas, tronco con textura, canto 1 px prop-line) a 16 px/m; ~6,4 m de alto, copa ~7 m"""
    rnd=random.Random(seed); LINE=C['propLine']
    ell(pn,0,0.05,1.7,0.16,(14,15,17,170))
    tr=[(0,0),(0.12,1.4),(-0.18,2.6),(0.05,3.6)]
    pn.line(tr,C['tileSide'],5.6); pn.line([(x+0.07,y) for x,y in tr],C['tileTop'],2.4)
    for x,y in tr[:-1]:
        for k in range(3): pn.line([(x-0.09+rnd.uniform(-0.03,0.03),y+k*0.35),(x-0.02,y+k*0.35+0.22)],LINE,0.6)
    for a,b in (((0,3.4),(-2.0,4.9)),((0.05,3.3),(2.2,5.1)),((-0.05,3.5),(-0.9,5.0)),((0.08,3.45),(1.0,5.2))):
        pn.line([a,b],C['tileSide'],2.6); pn.line([a,b],LINE,0.6)
    for (x,y,rx,ry) in ((-2.2,5.25,1.6,0.6),(0,5.7,1.8,0.7),(2.3,5.3,1.6,0.6),(-1.1,4.85,1.4,0.5),(1.3,4.9,1.4,0.5)):
        for _ in range(110):
            a=rnd.uniform(0,2*math.pi); r=rnd.random()**0.6; lx=x+math.cos(a)*rx*r; ly=y+math.sin(a)*ry*r
            sz=rnd.uniform(0.12,0.24)
            col=G1 if (ly<y-ry*0.2 or lx>x+rx*0.3) else (G3 if (ly>y+ry*0.3 and lx<x) else G2)
            ell(pn,lx,ly,sz,sz*0.7,col)
    for _ in range(16): u=rnd.uniform(-3.3,3.3); v=rnd.uniform(4.3,4.7); pn.line([(u,v),(u+0.15,v-0.25)],LINE,0.5)
ARBOL=dict(u0=-3.9,u1=3.9,v1=6.6)
def banco_f(pn):
    """banco del kit (paisaje/banco-exterior) de frente: patas metal, asiento y respaldo de madera charcoal"""
    ol=(58,61,68)
    for u in (-0.82,0.72): pn.rect(u,0,u+0.1,0.45,C['tileSide'],ol,0.6)
    pn.rect(-0.92,0.42,0.92,0.5,C['wood'],ol,0.6)
    pn.rect(-0.92,0.6,0.92,0.7,C['wood'],ol,0.6); pn.rect(-0.92,0.78,0.92,0.88,C['wood'],ol,0.6)
    for u in (-0.82,0.72): pn.rect(u,0.5,u+0.08,0.9,C['tileSide'],None)
BANCO=dict(u0=-1.0,u1=1.0,v1=1.0)

# ---------------- El Ávila (TilingSprite 2048 px = 360°) ----------------
AV_W,AV_H=2048,128
def avila_tile():
    w,h=AV_W*K,AV_H*K; im=Image.new('RGBA',(w,h),(0,0,0,0)); d=ImageDraw.Draw(im)
    rnd=random.Random(11)
    def per(x,terms): return sum(a*math.sin(2*math.pi*k*x/AV_W+ph) for k,a,ph in terms)
    far=[(k,a,rnd.uniform(0,6.28)) for k,a in ((2,16),(3,11),(5,7),(7,5),(11,3.2),(17,2.2),(29,1.3),(43,0.8),(71,0.5))]
    near=[(k,a,rnd.uniform(0,6.28)) for k,a in ((4,7),(6,5),(9,3.5),(13,2.6),(23,1.4),(37,0.8))]
    base=AV_H-2       # fila del horizonte (y=360) dentro del tile; el borde inferior va en y=362
    hf=lambda x: max(14,64+per(x,far)); hn=lambda x: max(6,20+per(x,near))
    xs=np.arange(0,AV_W+0.001,0.25)
    pf=[(x*K,(base-hf(x))*K) for x in xs]; pnn=[(x*K,(base-hn(x))*K) for x in xs]
    d.polygon(pf+[(w,h),(0,h)],fill=(25,27,33,255)); d.line(pf,fill=(50,53,61,255),width=K)
    d.polygon(pnn+[(w,h),(0,h)],fill=(17,18,22,255)); d.line(pnn,fill=(36,38,44,255),width=K)
    # hotel Humboldt sobre la cumbre más alta (silueta + 1 luz fría)
    xm=max(range(80,AV_W-80),key=hf); y0=base-hf(xm)
    d.rectangle([(xm-2)*K,(y0-9)*K,(xm+2)*K,(y0+1)*K],fill=(22,23,28,255),outline=(40,42,48,255),width=1)
    d.rectangle([(xm-3)*K,(y0-10)*K,(xm+3)*K,(y0-9)*K],fill=(40,42,48,255))
    for yy in (y0-7,y0-4): d.rectangle([(xm-1)*K,yy*K,xm*K-1,(yy+1)*K-1],fill=(120,136,160,255))
    # luces de barrio en el pie del cerro (frías; pocas tibias apagadas que no cuentan como ámbar)
    for _ in range(110):
        x=rnd.randint(2,AV_W-3); top=base-hn(x)+3
        if top>=base-1: continue
        y=rnd.randint(int(top),base-1); c=(70,74,82) if rnd.random()<0.8 else (96,82,60)
        d.rectangle([x*K,y*K,(x+1)*K-1,(y+1)*K-1],fill=c+(255,))
    return im,xm

# ---------------- suelos ----------------
def strip(fn):
    w=512; h=8; im=Image.new('RGB',(w,h),C['grass']); d=ImageDraw.Draw(im); m=lambda x: int(round((x+16)/32*w)); fn(d,m,w,h); return im
def base_avenida(d,m,w,h):
    d.rectangle([m(-9.5),0,m(9.5),h],fill=C['propFace']); d.rectangle([m(-5.25),0,m(5.25),h],fill=C['propLine'])
    d.rectangle([m(-5),0,m(5),h],fill=(22,23,27))
def s_cebra(d,m,w,h):
    base_avenida(d,m,w,h)
    for x in np.arange(-4.6,4.6,0.9): d.rectangle([m(x),0,m(x+0.45)-1,h],fill=(52,55,61))
def s_pare(d,m,w,h):
    base_avenida(d,m,w,h); d.rectangle([m(0.1),0,m(4.6),h],fill=(120,124,132))
def s_calle(d,m,w,h):
    d.rectangle([0,0,w,h],fill=(22,23,27))
def s_calle_eje(d,m,w,h):
    d.rectangle([0,0,w,h],fill=(22,23,27))
    for x in np.arange(-16,16,9): d.rectangle([m(x),3,m(x+4)-1,4],fill=C['tileLine'])
def s_acera(d,m,w,h):
    d.rectangle([0,0,w,h],fill=C['propFace']); 
    for x in np.arange(-16,16,2): d.line([(m(x),0),(m(x),h)],fill=C['tileLine'])
def s_plaza_a(d,m,w,h):
    d.rectangle([0,0,w,h],fill=(21,22,26)); d.line([(0,0),(w,0)],fill=(26,28,32))
    for x in np.arange(-16,16,2): d.line([(m(x),0),(m(x),h)],fill=(26,28,32))
def s_plaza_b(d,m,w,h):
    d.rectangle([0,0,w,h],fill=(21,22,26))
    for x in np.arange(-16,16,2): d.line([(m(x),0),(m(x),h)],fill=(26,28,32))
STRIPS={'suelo-cruce__cebra':(s_cebra,'paso peatonal: barras de 0,45 m cada 0,9 m sobre el asfalto (resto = sección de la avenida)'),
        'suelo-cruce__pare':(s_pare,'línea de pare del carril derecho (0,1…4,6 m), una fila de 0,4 m antes de la cebra'),
        'suelo-cruce__calle':(s_calle,'calle transversal: asfalto a todo el ancho'),
        'suelo-cruce__calle-eje':(s_calle_eje,'eje discontinuo de la transversal (raya 4 m / hueco 5 m en x, a mitad de la calle)'),
        'suelo-acera-frente':(s_acera,'acera de enfrente (juntas cada 2 m en x)'),
        'suelo-plaza__fase-a':(s_plaza_a,'plaza: losas de 2×2 m, fila con junta transversal'),
        'suelo-plaza__fase-b':(s_plaza_b,'plaza: losas de 2×2 m, fila sin junta (solo juntas en x)')}

PPM_P=16
def planta_cruce():
    """cruce de 4 brazos en planta (16 px/m, 32×32 m centrado en el cruce): para PerspectiveMesh o como guía de Graphics"""
    S=32*PPM_P; im=Image.new('RGB',(S*K//K*1,S),C['grass']); d=ImageDraw.Draw(im)
    M=lambda x: int(round((x+16)*PPM_P)); Z=lambda z: int(round((16-z)*PPM_P))   # z hacia arriba (adelante)
    R=lambda x0,z0,x1,z1,c: d.rectangle([M(min(x0,x1)),Z(max(z0,z1)),M(max(x0,x1))-1,Z(min(z0,z1))-1],fill=c)
    R(-9.5,-16,9.5,16,C['propFace']); R(-16,-9.5,16,9.5,C['propFace'])
    R(-5.25,-16,5.25,16,C['propLine']); R(-16,-5.25,16,5.25,C['propLine'])
    R(-5,-16,5,16,(22,23,27)); R(-16,-5,16,5,(22,23,27))
    for s_ in (-1,1):
        for z in np.arange(9.5,16,2): R(-9.5,s_*z,-5.25,s_*z+0.06*s_,C['tileLine']); R(5.25,s_*z,9.5,s_*z+0.06*s_,C['tileLine'])
    for k in range(4):   # 4 brazos: cebra + pare + eje
        for x in np.arange(-4.6,4.6,0.9):
            if k==0: R(x,6.0,x+0.45,8.8,(52,55,61))
            if k==1: R(x,-8.8,x+0.45,-6.0,(52,55,61))
            if k==2: R(6.0,x,8.8,x+0.45,(52,55,61))
            if k==3: R(-8.8,x,-6.0,x+0.45,(52,55,61))
    R(-4.6,9.2,-0.1,9.6,(120,124,132)); R(0.1,-9.6,4.6,-9.2,(120,124,132)); R(9.2,0.1,9.6,4.6,(120,124,132)); R(-9.6,-4.6,-9.2,-0.1,(120,124,132))
    for z in np.arange(10,16,6): R(-0.08,z,0.08,z+3,(120,124,132)); R(-0.08,-z-3,0.08,-z,(120,124,132)); R(z,-0.08,z+3,0.08,(120,124,132)); R(-z-3,-0.08,-z,0.08,(120,124,132))
    for s_ in (-1,1):
        R(s_*4.6,9.5,s_*4.6+0.06,16,(58,61,68)); R(s_*4.6,-16,s_*4.6+0.06,-9.5,(58,61,68))
        R(9.5,s_*4.6,16,s_*4.6+0.06,(58,61,68)); R(-16,s_*4.6,-9.5,s_*4.6+0.06,(58,61,68))
    return im
def planta_plaza():
    """losas 2×2 m, tile 16×16 m sin costura (16 px/m)"""
    S=16*PPM_P; im=Image.new('RGB',(S,S),(21,22,26)); d=ImageDraw.Draw(im); rnd=random.Random(8)
    for i in range(8):
        for j in range(8):
            c=rnd.choice([(21,22,26),(21,22,26),(22,23,27),(20,21,25)]); d.rectangle([i*32+1,j*32+1,i*32+31,j*32+31],fill=c)
    for k in range(8): d.line([(k*32,0),(k*32,S)],fill=(26,28,32)); d.line([(0,k*32),(S,k*32)],fill=(26,28,32))
    for i in range(0,8,4):   # franjas de piedra clara cada 8 m (ritmo de plaza)
        d.line([(i*32+16,0),(i*32+16,S)],fill=(30,32,37))
    return im
CRUCE_SPEC={
 "unidades":"metros, plano y=0; origen = centro del cruce; +z = adelante, +x = derecha (gira la spec 90° según la dirección de la cámara)",
 "uso":"en Pixi: proyecta cada polígono con la cámara (igual que la avenida en Graphics) en orden de lista; recorta a z ≥ 2,2 m",
 "poligonos":[
  {"id":"acera","fill":"#24262B","pts":[[-9.5,-16],[9.5,-16],[9.5,16],[-9.5,16]]},
  {"id":"acera-transversal","fill":"#24262B","pts":[[-16,-9.5],[16,-9.5],[16,9.5],[-16,9.5]]},
  {"id":"brocal","fill":"#5A5E66","pts":[[-5.25,-16],[5.25,-16],[5.25,16],[-5.25,16]]},
  {"id":"brocal-transversal","fill":"#5A5E66","pts":[[-16,-5.25],[16,-5.25],[16,5.25],[-16,5.25]]},
  {"id":"asfalto","fill":"#16171B","pts":[[-5,-16],[5,-16],[5,16],[-5,16]]},
  {"id":"asfalto-transversal","fill":"#16171B","pts":[[-16,-5],[16,-5],[16,5],[-16,5]]},
  {"id":"cebra-norte","fill":"#34373D","barras":{"x0":-4.6,"x1":4.6,"paso":0.9,"ancho":0.45,"z0":6.0,"z1":8.8}},
  {"id":"pare-norte","fill":"#787C84","pts":[[-4.6,9.2],[-0.1,9.2],[-0.1,9.6],[-4.6,9.6]],"nota":"carril que viene hacia el cruce"},
  {"id":"eje","fill":"#787C84","rayas":{"largo":3,"paso":6,"ancho":0.16,"desde":10}}],
 "otros_brazos":"sur/este/oeste = misma spec rotada 90°/180°/270° (ver suelo-cruce__planta)"}
