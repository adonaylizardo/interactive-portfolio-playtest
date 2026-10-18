# Primera persona · fachadas Catedral y Flor redibujadas desde FOTOS REALES (BORRADOR, 17 oct 2026).
# Alzados en metros (Pn: u=0 centro, v=0 suelo). Mismo lienzo, ancla y metros que v2. Las fotos (refs/) solo se miraron.
import math, random
import numpy as np
from PIL import Image, ImageDraw
import build_primera_persona as B
C=B.C; OL=C['propLine']; WARM=C['warm']; DIM=C['dim']; GLASS=C['glass']; GLOW=C['glow']
STEEL=(40,42,47); CONC=(84,88,96); CONC_SH=(64,67,74); CONC_HI=(150,154,162)
G1,G2,G3=(23,28,24),(34,43,36),(52,64,58)
def _glow(pn,cx,cy,rings):
    """halo de luz en capa aparte (anillos duros de alfa bajo, como el kit) → alpha_composite"""
    lay=Image.new('RGBA',pn.im.size,(0,0,0,0)); dl=ImageDraw.Draw(lay); x,y=pn.p(cx,cy)
    for rx,ry,a in rings: dl.ellipse([x-rx*pn.s,y-ry*pn.s,x+rx*pn.s,y+ry*pn.s],fill=GLOW+(a,))
    pn.im.alpha_composite(lay); pn.refresh()

# ======================= CATEDRAL METROPOLITANA DE BARQUISIMETO (Jan Bergkamp, 1968) =======================
# Foto guía: frente simétrico (refs/catedral-frente_jesus-david-rios.jpg; alas: refs/catedral-alas_reindertot.jpg). Proporciones medidas en la foto y llevadas a metros
# con la cruz a ~27 m (puertas ~7 m). Alas comprimidas ~9 % en ancho para caber en los 46 m del lienzo v2.
CT_HW=[(19.6,1.50),(18.0,1.42),(16.0,1.40),(14.5,1.55),(13.2,1.95),(12.2,2.55),(11.3,3.35),(10.5,4.35),(9.9,5.40),(9.4,6.50),(9.05,7.40)]
def ct_hw(v):
    for (v0,w0),(v1,w1) in zip(CT_HW,CT_HW[1:]):
        if v1<=v<=v0: t=(v0-v)/(v0-v1); return w0+(w1-w0)*t
    return CT_HW[-1][1]
def catedral(pn,luz=True):
    rnd=random.Random(17)
    # --- alas: cubierta de paraboloide hiperbólico (vidrio sobre red de nervios) que baja desde la torre y remata en punta
    TIP=22.6
    def top_e(t): return 8.7-2.75*t**0.85+0.9*t**6                       # borde superior (cumbrera) cóncavo
    def eave(t): return 3.55+2.95*t**2.4                                  # alero/viga de borde que SUBE hacia la punta (silla)
    def ux(t,s_): return s_*(6.9+(TIP-6.9)*t)
    def uxe(t,s_): return s_*(10.2+(TIP-10.2)*t)
    for s_ in (-1,1):
        ts=np.linspace(0,1,40)
        top=[(ux(t,s_),top_e(t)) for t in ts]; bot=[(uxe(t,s_),eave(t)) for t in ts[::-1]]
        # muro bajo el alero (pilares blancos + vitrales)
        wall=[(uxe(t,s_),eave(t)-0.35) for t in ts]+[(s_*TIP,0),(s_*10.2,0)]
        pn.poly(wall,C['tileSide'],OL,0.8)
        for k,t in enumerate(np.linspace(0.03,0.97,13)):
            u=uxe(t,s_); hv=eave(t)-0.35
            nt=np.clip(t+0.072,0,1); u2=uxe(nt,s_)
            if k<12:
                a,b=sorted((u+s_*0.32,u2-s_*0.05)); vt=min(hv,eave(nt)-0.35)-0.35
                lit=luz and rnd.random()<0.55
                pn.rect(a,0.55,b,vt,(WARM if rnd.random()<0.35 else DIM) if lit else GLASS,None)
                if lit: pn.hline(a,b,(0.55+vt)/2,(60,48,34),0.5)                 # travesaño del vitral
            pn.rect(u-0.16,0,u+0.16,hv,(104,108,116),None)                         # pilar blanco
        pn.rect(s_*10.2-0.0,0,s_*TIP,0.5,C['tileTop'],None)                        # zócalo
        # cubierta de vidrio
        pn.poly(top+bot,(24,28,34),None)
        if luz:   # el acrílico deja ver la nave encendida: algunos paños tibios oscuros (DIM no cuenta como ámbar)
            for i in range(2,9):
                for j in range(1,3):
                    if rnd.random()<0.28:
                        t0,t1=i/10,(i+1)/10; f0,f1=j/4,(j+1)/4
                        q=[(ux(t,s_)*(1-f)+uxe(t,s_)*f, top_e(t)*(1-f)+eave(t)*f) for t,f in ((t0,f0),(t1,f0),(t1,f1),(t0,f1))]
                        pn.poly(q,(52,44,34),None)
        for i in range(1,10):                                                     # nervios reglados (cumbrera → alero)
            t=i/10; pn.line([(ux(t,s_),top_e(t)),(uxe(t,s_),eave(t))],(46,50,58),0.5)
        for f in (0.33,0.66):                                                     # nervios longitudinales
            pn.line([(ux(t,s_)*(1-f)+uxe(t,s_)*f, top_e(t)*(1-f)+eave(t)*f) for t in ts],(46,50,58),0.5)
        pn.line(top,(112,116,124),0.8)
        pn.line([(uxe(t,s_),eave(t)) for t in ts],CONC_HI,1.6)                   # viga de borde blanca
        pn.line([(uxe(t,s_),eave(t)-0.3) for t in ts],(70,74,82),0.6)
    # --- torre-linterna central: hiperboloide de concreto blanco perforado, con falda que abraza el pórtico
    vs=np.linspace(9.05,19.6,48)
    L_=[(-ct_hw(v),v) for v in vs]; R_=[(ct_hw(v),v) for v in vs[::-1]]
    pn.poly(L_+R_,CONC,OL,0.8)
    pn.poly([(0,9.05)]+[(ct_hw(v)*0.92,v) for v in vs]+[(0,19.6)],CONC_SH,None)      # mitad derecha en sombra
    pn.line([(-ct_hw(v)+0.12,v) for v in vs],CONC_HI,0.7)                         # filo iluminado
    # perforaciones romboidales en tresbolillo (de noche: linterna encendida = algunas brillan)
    for r,v in enumerate(np.arange(10.6,19.2,0.82)):
        hw=ct_hw(v); n=max(3,int(hw/0.62)); off=0.31 if r%2 else 0
        for k in range(-n,n+1):
            u=k*0.62+off
            if abs(u)>hw-0.32: continue
            col=(GLOW if rnd.random()<0.28 else WARM) if (luz and v>12.0 and abs(u)<hw*0.8) else (30,32,37)
            pn.poly([(u,v+0.2),(u+0.13,v),(u,v-0.2),(u-0.13,v)],col,None)
    pn.rect(-1.62,19.55,1.62,19.95,C['tileLine'],OL,0.6)                           # anillo de remate
    pn.rect(-0.11,19.95,0.11,27.0,(110,114,122),None)                              # mástil
    pn.rect(-0.95,25.55,0.95,25.8,(110,114,122),None); pn.rect(-0.45,26.35,0.45,26.55,(110,114,122),None)   # cruz (doble travesaño)
    # vidriera triangular (la «cúpula» de vidrio y acero bajo la falda)
    gl=[(-4.0,9.0),(0,11.5),(4.0,9.0)]
    pn.poly(gl,DIM if luz else GLASS,OL,0.7)
    for u in (-2.6,-1.3,0,1.3,2.6): pn.line([(u,9.0),(u,9.0+2.5*(1-abs(u)/4.0))],(58,61,68),0.5)
    pn.line([(-2.6,9.85),(2.6,9.85)],(58,61,68),0.5)
    if luz: pn.poly([(-0.55,9.1),(0,9.95),(0.55,9.1)],WARM,None)
    # --- pórtico: arco rebajado de borde blanco grueso con intradós oscuro
    def arc(hw,top,base,n=48): return [(hw*math.sin(t),base+(top-base)*math.cos(t)**0.62) for t in np.linspace(-math.pi/2,math.pi/2,n)]
    outer=arc(10.2,9.15,2.6); inner=arc(9.3,8.3,2.6)
    pn.poly([(-10.2,0)]+outer+[(10.2,0)],C['shell'],OL,0.8)
    pn.poly([(-9.3,0)]+inner+[(9.3,0)],(20,21,25),None)
    in2=arc(8.6,7.7,2.6)
    pn.poly([(-8.6,0)]+in2+[(8.6,0)],C['tileSide'],None)                          # plano de fachada retranqueado
    pn.line(outer,CONC_HI,0.8)
    # vidrieras verticales a los lados (entre arco y pilastras)
    for s_ in (-1,1):
        for k,u in enumerate((7.6,7.0)):
            a,b=sorted((s_*u,s_*(u-0.42))); top_v=2.6+(7.7-2.6)*math.cos(math.asin(min(1,abs(u)/8.6)))**0.62-0.3
            pn.rect(a,0.4,b,top_v,(WARM if k==0 else DIM) if luz else GLASS,None)
    # 4 pilastras blancas + paneles de cobre a los lados de la puerta
    for a,b in ((-6.4,-5.25),(-5.0,-3.85),(3.85,5.0),(5.25,6.4)):
        pn.rect(a,0,b,7.35,(112,116,124),OL,0.6); pn.line([(b-0.15,0.1),(b-0.15,7.2)],(84,88,96),0.5)
    for a,b in ((-6.55+0.0,-6.4),(6.4,6.55)): pass
    for a,b in ((-5.25,-5.0),(5.0,5.25)): pn.rect(a,0.2,b,7.2,C['wood'],None)
    # puerta principal: dos hojas de cobre con sol tallado (rayos) — madera apagada; encendida = canto de luz y montante
    pn.rect(-3.85,0,3.85,7.2,C['wood'],OL,0.7)
    cx,cy=0,4.3
    for k in range(20):
        a=math.radians(k*18+9); pn.line([(cx+0.5*math.cos(a),cy+0.5*math.sin(a)),(cx+3.3*math.cos(a)*0.95,cy+2.6*math.sin(a))],(66,56,46),0.6)
    pn.poly([(cx+0.55*math.cos(math.radians(a)),cy+0.55*math.sin(math.radians(a))) for a in range(0,360,30)],(70,60,48),None)
    pn.line([(0,0),(0,7.2)],GLOW if luz else C['tileSide'],0.6)
    pn.rect(-3.85,6.75,3.85,7.2,(52,44,34),None)
    if luz: pn.rect(-3.6,6.85,3.6,7.05,WARM,None); pn.rect(-0.5,0,0.5,0.25,(74,58,38),None)
    # plaza / vereda
    pn.rect(-23,-0.01,23,0.32,C['tileTop'],C['tileLine'],0.5)

# ======================= FLOR DE VENEZUELA (Fruto Vivas, Expo 2000 Hannover → Barquisimeto) =======================
# Foto guía: vista frontal con pétalos abiertos (refs/flor-frontal_miguel-ahiezer-salcedo.jpg) + nocturna frontal (refs/flor-noche_beachpow.jpg).
# Datos: Ø 38–39 m, 16 pétalos móviles, tallo en celosía de ~18 m. Pétalos modelados en 3D y proyectados en ortogonal frontal.
HUB=(0.0,13.9); ENV_A=17.6; ENV_B=6.1   # tallo/capitel a 13,9 m (dato: mástil de ~18 m incluido el capitel)
# Vista frontal = abanico 2D medido en la foto nocturna frontal: 8 pétalos «teja convexa» (membrana clara) que llegan a una
# envolvente elíptica (±17,6 m, +6,1 m sobre el capitel; los laterales caen ~2 m bajo él) y 7 pétalos «teja cóncava»
# intercalados, más oscuros y cortos, delante. El de enfrente se ve como triángulo con la punta hacia abajo sobre el tallo.
def _env(th,k=1.0):
    t=math.radians(th); return (HUB[0]+ENV_A*k*math.cos(t), HUB[1]+ENV_B*k*math.sin(t))
def _root(th,off):
    t=math.radians(th); return (HUB[0]+0.9*math.cos(t)-off*math.sin(t), HUB[1]+0.35*math.sin(t)+off*math.cos(t))
def flor(pn,luz=True):
    rnd=random.Random(5)
    LIT=[-15,14.5,44,73.5,106.5,136,165.5,195]; DRK=[(LIT[i]+LIT[i+1])/2 for i in range(len(LIT)-1)]
    def lobe(th,dl,k,fill,fill2,edge,rib,cross=True):
        L=[_root(th,-0.45)]+[_env(th-dl*f,k*(0.25+0.75*f)) for f in np.linspace(0.15,1,8)]
        top=[_env(th-dl+2*dl*f,k*(0.92+0.13*math.sin(math.pi*f)**0.7)) for f in np.linspace(0,1,13)]
        R=[_env(th+dl*f,k*(0.25+0.75*f)) for f in np.linspace(1,0.15,8)]+[_root(th,0.45)]
        # las puntas de las esquinas caen un poco (borde de membrana tensada)
        cl=_env(th-dl-1.0,k*0.95); cr=_env(th+dl+1.0,k*0.95); cl=(cl[0],cl[1]-0.3); cr=(cr[0],cr[1]-0.3)
        poly=L+[cl]+top+[cr]+R
        pn.poly(poly,fill,None)
        mid=[_root(th,0)]+[_env(th,k*(0.25+0.75*f)) for f in np.linspace(0.15,1,8)]+[_env(th,k*1.05)]
        pn.poly(L+[cl]+top[:7]+mid[::-1],fill2,None)                        # media cara más clara (curvatura)
        pn.line(L+[cl]+top+[cr]+R,edge,0.7)
        pn.line(mid,rib,0.5)
        if cross:
            for f in (0.55,0.8): pn.line([_env(th-dl*0.97+2*dl*0.97*g,k*f*(1+0.04*math.sin(math.pi*g))) for g in np.linspace(0,1,9)],rib,0.4)
        return poly
    # --- (los pétalos van después del tambor y el tallo; ver abajo)
    # --- terrazas de jardineras (tepuy) + rampa curva a la izquierda
    for k,(hw,v0,v1) in enumerate([(19.6,0,0.75),(18.4,0.75,1.5),(17.2,1.5,2.25),(16.0,2.25,3.0),(14.8,3.0,3.75),(13.6,3.75,4.5),(12.6,4.5,5.2)]):
        pn.rect(-hw,v0,hw,v1,C['tileSide'],OL,0.6)
        pn.rect(-hw+0.3,v1-0.32,hw-0.3,v1-0.04,G2 if k%2 else G1,None)
        for _ in range(int(hw*2.2)):
            u=rnd.uniform(-hw+0.4,hw-0.4); pn.rect(u,v1-0.36,u+rnd.uniform(0.2,0.6),v1-0.05,rnd.choice((G1,G2,G3)),None)
    pn.rect(-19.6,0,19.6,0.12,C['tileLine'],None)
    # --- tambor de vidrio de dos niveles con balcón
    pn.rect(-11.6,5.2,11.6,7.6,GLASS,OL,0.7)
    for i,u in enumerate(np.arange(-11.2,11.3,1.4)):
        pn.line([(u,5.2),(u,7.6)],(58,61,68),0.5)
        if luz and i%3==1: pn.rect(u+0.12,5.4,u+1.28,7.35,WARM if i%2 else DIM,None)
        elif luz and i%3==2: pn.rect(u+0.12,5.4,u+1.28,7.35,DIM,None)
    pn.rect(-12.4,7.6,12.4,8.05,C['tileTop'],OL,0.7)                          # losa / balcón
    pn.hline(-12.3,12.3,8.85,(118,122,130),0.6)                                # baranda
    for u in np.arange(-12.0,12.1,1.5): pn.line([(u,8.05),(u,8.85)],(70,74,82),0.4)
    if luz:
        for u in np.arange(-11.0,11.1,2.75): pn.rect(u-0.1,7.48,u+0.1,7.58,GLOW,None)   # focos bajo el balcón
    pn.rect(-10.4,8.05,10.4,10.5,GLASS,OL,0.7)
    for i,u in enumerate(np.arange(-10.0,10.1,1.25)):
        pn.line([(u,8.05),(u,10.5)],(58,61,68),0.5)
        if luz and i%4==1: pn.rect(u+0.1,8.25,u+1.15,10.3,WARM,None)
        elif luz and i%4==3: pn.rect(u+0.1,8.25,u+1.15,10.3,DIM,None)
    pn.rect(-10.7,10.5,10.7,10.85,C['tileTop'],OL,0.6)
    # rampa helicoidal (izquierda, como en la foto frontal)
    ramp=[(-20.6+9.6*t,4.6+2.4*t**1.3) for t in np.linspace(0,1,20)]
    pn.poly(ramp+[(p[0],p[1]-0.45) for p in ramp[::-1]],C['propFace'],OL,0.6)
    pn.line([(p[0],p[1]+0.7) for p in ramp],(118,122,130),0.5)
    for t in (0.1,0.45,0.8): x,y=ramp[int(t*19)]; pn.line([(x,y-0.45),(x,y-0.45-(y-0.45-3.75*0+0)*0.0-1.9)],(70,74,82),0.6)
    # acceso con marquesina inclinada (letrero VENEZUELA) al frente
    pn.poly([(-4.6,3.9),(4.6,4.7),(4.6,5.5),(-4.6,4.7)],(40,44,64),OL,0.7)
    pn.line([(-3.6,4.5),(3.6,5.12)],(120,124,140),0.9)                         # letras = trazo claro (ilegible a 1x, a propósito)
    pn.rect(-0.12,0,0.12,4.3,(104,108,116),None); pn.rect(3.9,0,4.1,4.85,(104,108,116),None)
    pn.rect(-1.4,0,1.4,2.9,GLASS,OL,0.6)
    if luz: pn.rect(-1.2,0.05,1.2,0.25,DIM,None); pn.line([(-4.4,3.85),(4.4,4.62)],WARM,0.5)
    # --- tallo: celosía tubular octogonal que se abre en capitel
    pn.poly([(-1.5,10.85),(1.5,10.85),(3.4,HUB[1]),(-3.4,HUB[1])],(22,24,28),None)
    for k in range(5):
        a=-1.5+0.75*k; b=-3.4+1.7*k; pn.line([(a,10.85),(b,HUB[1])],(70,74,82),0.6)
    for v in (11.6,12.4,13.2): w=1.5+(3.4-1.5)*(v-10.85)/(HUB[1]-10.85); pn.hline(-w,w,v,(58,61,68),0.5)
    for k in range(4):
        a=-1.5+0.75*k; b=-3.4+1.7*(k+1); pn.line([(a,10.85),(b,HUB[1])],(48,51,57),0.4); pn.line([(a+0.75,10.85),(b-1.7,HUB[1])],(48,51,57),0.4)
    pn.rect(-3.5,HUB[1]-0.2,3.5,HUB[1]+0.25,C['tileLine'],OL,0.6)            # capitel
    # --- pétalos: convexos (claros, detrás) desde los costados hacia el centro, luego cóncavos (oscuros, delante)
    for th in sorted(LIT,key=lambda t:-abs(t-90)):
        lobe(th,14.6,1.0,(74,78,86),(86,90,98),(124,128,136),(52,55,61))
    for th in sorted(DRK,key=lambda t:-abs(t-90)):      # teja cóncava: trapecio ancho afuera, nace a media distancia
        inner=[_env(th+5.5-11*f,0.40) for f in np.linspace(0,1,5)]
        outer=[_env(th-7.5+15*f,0.93*(1+0.04*math.sin(math.pi*f))) for f in np.linspace(0,1,11)]
        pn.poly(inner+outer,(42,44,50),(88,92,100),0.6)
        pn.poly(inner[2:]+outer[:6],(48,50,57),None)
        pn.line([_env(th,0.42),_env(th,0.93)],(30,32,36),0.5)
        pn.line([_env(th-1.5,0.36),_env(th,0.40)],(70,74,82),0.5)          # brazo de acero hasta el capitel
    # pétalo de enfrente: se ve casi de canto, triángulo con la punta hacia abajo sobre el capitel
    pn.poly([(-2.5,19.2),(0,19.55),(2.5,19.2),(0.25,14.7),(-0.25,14.7)],(56,59,66),(124,128,136),0.7)
    pn.line([(0,19.45),(0,14.8)],(40,42,47),0.5)
    if luz:   # el capitel ilumina desde abajo la base de los pétalos (tibio oscuro: no cuenta como ámbar)
        for th in LIT:
            pn.poly([_root(th,-0.3),_env(th-4,0.22),_env(th+4,0.22),_root(th,0.3)],(74,58,38),None)
        _glow(pn,0,HUB[1]+0.3,((2.6,1.5,10),(1.5,0.9,16),(0.7,0.45,30))); pn.rect(-0.35,HUB[1]+0.05,0.35,HUB[1]+0.45,GLOW,None)

FUENTE_REF={
 'catedral-de-barquisimeto':[
  dict(url='https://commons.wikimedia.org/wiki/File:Catedral_Metropolitana_de_Barquisimeto.jpg',autor='Jesús David Ríos (Flickr)',licencia='CC BY-SA 2.0',archivo='refs/catedral-frente_jesus-david-rios.jpg',uso='alzado principal'),
  dict(url='https://commons.wikimedia.org/wiki/File:Catedral_de_Barquisimeto.jpg',autor='reindertot',licencia='CC BY 2.0',archivo='refs/catedral-alas_reindertot.jpg',uso='puntas de las alas'),
  dict(url='https://commons.wikimedia.org/wiki/File:Vista_de_la_Catedral_de_Barquisimeto_y_su_campanario.jpg',autor='LoganPaelias',licencia='CC BY-SA 4.0',archivo='refs/catedral-campanario_loganpaelias.jpg',uso='campanario exento (no incluido)')],
 'flor-de-venezuela':[
  dict(url='https://commons.wikimedia.org/wiki/File:Flor_de_Venezuela_(Barquisimeto),_vista_frontal.jpg',autor='Miguel Ahiezer Salcedo',licencia='CC BY-SA 3.0',archivo='refs/flor-frontal_miguel-ahiezer-salcedo.jpg',uso='alzado principal'),
  dict(url='https://commons.wikimedia.org/wiki/File:Flor_de_venezuela_barquisimeto_lara_3.jpg',autor='beachpow',licencia='CC BY-SA 4.0',archivo='refs/flor-noche_beachpow.jpg',uso='abanico de pétalos de frente, de noche')]}
