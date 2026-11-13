# Flor de Venezuela v3b (BORRADOR, 17 oct 2026): pétalos = hojas largas y curvas, separadas, que nacen del capitel y se abren
# HACIA ARRIBA Y AFUERA con punta propia (corona de palma). Trazado sobre la foto frontal de día (Miguel Ahiezer Salcedo) y
# contrastado con la nocturna (beachpow). Base (jardineras, tambor, rampa, marquesina) igual que la v3 anterior.
import math, random
import numpy as np
from PIL import Image, ImageDraw
import build_primera_persona as B
from v3_catedral_flor import _glow
C=B.C; OL=C['propLine']; WARM=C['warm']; DIM=C['dim']; GLASS=C['glass']; GLOW=C['glow']
G1,G2,G3=(23,28,24),(34,43,36),(52,64,58)
HUB=12.9            # capitel (m). Foto nocturna: ~13,8 m; se baja 0,9 m para que la corona quepa en 20,4 m
VK=0.80             # compresión vertical de la corona respecto de la foto de día (cámara baja = exagera la altura)
# Pétalos medidos en la foto de día (escala: semienvergadura 19,5 m = 400 px a 1280 px; origen = capitel).
# Cada uno: raíz R, cresta C (punto más alto del arco), punta T — en metros relativos al capitel, lado derecho (+u).
PET=[('P0',(1.6,6.0),(3.8,8.3),(9.5,7.0)),      # superiores, casi verticales (detrás de la bandera en la foto)
     ('P1',(4.2,5.8),(8.6,7.3),(16.8,3.3)),     # hoja alta (b / f)
     ('P2',(4.6,3.4),(10.9,3.8),(19.6,-2.4)),   # hoja media (c / g)
     ('P3',(5.2,1.0),(11.2,1.2),(17.0,-4.2)),   # hoja media baja (h)
     ('P4',(4.6,-0.4),(8.5,-0.7),(15.0,-5.9))]  # hoja baja que cae junto al tambor (d / i)
# pétalos de atrás (solo variante «profundidad»): entre P0–P1 y P2–P3, más el central trasero; más chicos y oscuros
BACK=[('B01',(3.2,6.6),(8.2,8.1),(14.4,6.0)),('B12',(4.6,4.8),(11.8,5.6),(20.4,0.9)),('B34',(5.0,0.0),(9.6,0.4),(17.4,-6.3))]
def _bez(R,Cc,T,n=28):
    P1=(2*Cc[0]-(R[0]+T[0])/2, 2*Cc[1]-(R[1]+T[1])/2)            # control tal que la curva pasa por la cresta en t=0,5
    return [((1-t)**2*R[0]+2*(1-t)*t*P1[0]+t*t*T[0], (1-t)**2*R[1]+2*(1-t)*t*P1[1]+t*t*T[1]) for t in np.linspace(0,1,n)]
def leaf(pn,R,Cc,T,s_,luz,tone='front',k=1.0,wmax=2.15):
    """hoja curva: borde superior = arco de acero; membrana que cuelga debajo con borde festoneado; punta aguda"""
    f=lambda p:(s_*p[0]*k, HUB+p[1]*VK*k)
    sp=[f(p) for p in _bez(R,Cc,T)]; n=len(sp)
    up=[];lo=[]
    for i,(x,y) in enumerate(sp):
        a=sp[max(0,i-1)]; b=sp[min(n-1,i+1)]; dx,dy=b[0]-a[0],b[1]-a[1]; L=math.hypot(dx,dy) or 1
        nx,ny=-dy/L,dx/L
        if ny<0: nx,ny=-nx,-ny                                        # normal «hacia arriba»
        s=i/(n-1); w=wmax*k*(0.35+0.65*math.sin(math.pi*min(1,s*1.05))**0.75)*(1-s**3)   # punta aguda
        fest=1+0.18*abs(math.sin(s*math.pi*4.5))                      # festón entre costillas
        up.append((x+nx*w*0.28,y+ny*w*0.28)); lo.append((x-nx*w*fest,y-ny*w*fest))
    up[-1]=lo[-1]=sp[-1]
    if tone=='front': top,und,edge,rib,line=(98,102,110),(68,71,78),(140,144,152),(40,42,47),(112,116,124)
    else:             top,und,edge,rib,line=(60,63,70),(42,44,50),(86,90,98),(30,32,36),(70,74,82)
    pn.poly(up+lo[::-1],und,None)
    if luz:   # luz cálida tenue desde el capitel sobre la cara inferior (tibio oscuro: no cuenta como ámbar)
        m=int(n*0.45); pn.poly(up[:m]+lo[:m][::-1],tuple(int(c*0.7+d*0.3) for c,d in zip(und,(84,66,44))),None)
    band=[(x*0.55+u[0]*0.45,y*0.55+u[1]*0.45) for (x,y),u in zip(sp,up)]
    pn.poly(up+band[::-1],top,None)                                   # lomo iluminado de la membrana
    for i in range(2,n-3,3):                                          # costillas de la cercha bajo la membrana
        pn.line([sp[i],lo[i]],rib,0.45)
    pn.line(sp[:-2],rib,0.5)
    pn.line(lo,line,0.55); pn.line(up,edge,0.75)
def flor(pn,luz=True,profundidad=False):
    rnd=random.Random(5)
    # --- jardineras escalonadas (tepuy)
    for k,(hw,v0,v1) in enumerate([(19.6,0,0.75),(18.4,0.75,1.5),(17.2,1.5,2.25),(16.0,2.25,3.0),(14.8,3.0,3.75),(13.6,3.75,4.5),(12.6,4.5,5.2)]):
        pn.rect(-hw,v0,hw,v1,C['tileSide'],OL,0.6)
        pn.rect(-hw+0.3,v1-0.32,hw-0.3,v1-0.04,G2 if k%2 else G1,None)
        for _ in range(int(hw*2.2)):
            u=rnd.uniform(-hw+0.4,hw-0.4); pn.rect(u,v1-0.36,u+rnd.uniform(0.2,0.6),v1-0.05,rnd.choice((G1,G2,G3)),None)
    pn.rect(-19.6,0,19.6,0.12,C['tileLine'],None)
    # --- pétalos de atrás (variante profundidad): detrás del tambor y del tallo
    if profundidad:
        pn.line([(0,HUB),(0,HUB+7.0)],(30,32,36),0.8)
        for nm,R,Cc,T in BACK[::-1]:
            for s_ in (-1,1): leaf(pn,R,Cc,T,s_,luz,'back',1.0,1.6)
        # central trasero: hoja que sube y se aleja (se ve corta, punta arriba)
        pn.poly([(-1.3,HUB+5.0),(0,HUB+7.25),(1.3,HUB+5.0),(0.4,HUB+3.3),(-0.4,HUB+3.3)],(54,57,64),(86,90,98),0.6)
    # --- tambor de vidrio de dos niveles con balcón
    pn.rect(-11.6,5.2,11.6,7.6,GLASS,OL,0.7)
    for i,u in enumerate(np.arange(-11.2,11.3,1.4)):
        pn.line([(u,5.2),(u,7.6)],(58,61,68),0.5)
        if luz and i%3==1: pn.rect(u+0.12,5.4,u+1.28,7.35,WARM if i%2 else DIM,None)
        elif luz and i%3==2: pn.rect(u+0.12,5.4,u+1.28,7.35,DIM,None)
    pn.rect(-12.4,7.6,12.4,8.05,C['tileTop'],OL,0.7)
    pn.hline(-12.3,12.3,8.85,(118,122,130),0.6)
    for u in np.arange(-12.0,12.1,1.5): pn.line([(u,8.05),(u,8.85)],(70,74,82),0.4)
    if luz:
        for u in np.arange(-11.0,11.1,2.75): pn.rect(u-0.1,7.48,u+0.1,7.58,GLOW,None)
    pn.rect(-10.4,8.05,10.4,10.5,GLASS,OL,0.7)
    for i,u in enumerate(np.arange(-10.0,10.1,1.25)):
        pn.line([(u,8.05),(u,10.5)],(58,61,68),0.5)
        if luz and i%4==1: pn.rect(u+0.1,8.25,u+1.15,10.3,WARM,None)
        elif luz and i%4==3: pn.rect(u+0.1,8.25,u+1.15,10.3,DIM,None)
    pn.rect(-10.7,10.5,10.7,10.85,C['tileTop'],OL,0.6)
    ramp=[(-20.6+9.6*t,4.6+2.4*t**1.3) for t in np.linspace(0,1,20)]
    pn.poly(ramp+[(p[0],p[1]-0.45) for p in ramp[::-1]],C['propFace'],OL,0.6)
    pn.line([(p[0],p[1]+0.7) for p in ramp],(118,122,130),0.5)
    for t in (0.1,0.45,0.8): x,y=ramp[int(t*19)]; pn.line([(x,y-0.45),(x,y-2.35)],(70,74,82),0.6)
    pn.poly([(-4.6,3.9),(4.6,4.7),(4.6,5.5),(-4.6,4.7)],(40,44,64),OL,0.7)
    pn.line([(-3.6,4.5),(3.6,5.12)],(120,124,140),0.9)
    pn.rect(-0.12,0,0.12,4.3,(104,108,116),None); pn.rect(3.9,0,4.1,4.85,(104,108,116),None)
    pn.rect(-1.4,0,1.4,2.9,GLASS,OL,0.6)
    if luz: pn.rect(-1.2,0.05,1.2,0.25,DIM,None); pn.line([(-4.4,3.85),(4.4,4.62)],WARM,0.5)
    # --- tallo en celosía (octógono que se abre) + capitel con brazos radiales hasta la raíz de cada hoja
    pn.poly([(-1.4,10.85),(1.4,10.85),(2.6,HUB),(-2.6,HUB)],(22,24,28),None)
    for k in range(5): pn.line([(-1.4+0.7*k,10.85),(-2.6+1.3*k,HUB)],(70,74,82),0.6)
    for k in range(4):
        pn.line([(-1.4+0.7*k,10.85),(-2.6+1.3*(k+1),HUB)],(48,51,57),0.4); pn.line([(-0.7+0.7*k,10.85),(-2.6+1.3*k,HUB)],(48,51,57),0.4)
    for v in (11.6,12.4): w=1.4+1.2*(v-10.85)/(HUB-10.85); pn.hline(-w,w,v,(58,61,68),0.5)
    for nm,R,Cc,T in PET:
        for s_ in (-1,1): pn.line([(0,HUB+0.3),(s_*R[0],HUB+R[1]*VK)],(34,36,41),2.2); pn.line([(0,HUB+0.3),(s_*R[0],HUB+R[1]*VK)],(76,80,88),0.5)
    pn.poly([(-2.8,HUB-0.2),(2.8,HUB-0.2),(1.9,HUB+1.1),(-1.9,HUB+1.1)],(30,32,37),OL,0.6)
    # --- hojas delanteras: de abajo hacia arriba (las altas tapan a las bajas, como en la foto)
    for nm,R,Cc,T in PET[::-1]:
        for s_ in (-1,1): leaf(pn,R,Cc,T,s_,luz)
    # hoja central delantera: viene hacia el observador; se ve como hoja con la punta hacia abajo sobre el capitel
    cf=[(0,HUB+7.0*VK+0.4)]+[(1.7*math.sin(math.pi*t)**0.8*(1-t**2.5),HUB+(7.0-6.2*t)*VK) for t in np.linspace(0.05,1,14)]
    cf2=[(-x,y) for x,y in cf[::-1]]
    pn.poly(cf+cf2,(68,71,78),None)
    pn.poly(cf+[(0,cf[-1][1])],(80,84,92),None)
    pn.line(cf+cf2,(140,144,152),0.7); pn.line([(0,HUB+6.8*VK),(0,HUB+1.2*VK)],(40,42,47),0.5)
    if luz:
        _glow(pn,0,HUB+0.4,((2.4,1.4,10),(1.4,0.85,16),(0.65,0.42,30)))
        pn.rect(-0.35,HUB+0.15,0.35,HUB+0.55,GLOW,None)
def flor_profundidad(pn,luz=True): flor(pn,luz,True)
