"""Pantone (husky de Adonay) de ESPALDAS / 3/4 espalda para la cámara de 3ª persona.
Misma densidad que adonay-espalda: 1 px de arte = 1,78/144 m = 1,236 cm (→ 2 px @1x a la distancia de Adonay).
Alto a la punta de las orejas 0,76 m (= 21/48 del alto de Adonay, la proporción de los sprites del mapa: 21 filas vs 48).
Paleta exacta de forge-paquete/personaje/pantone (blanco, manto gris, gorro oscuro, collar rojo, contorno casi negro)."""
from PIL import Image, ImageDraw
import numpy as np, math
W,H=44,66; FEET=64; CX=22
OL=(18,14,12); WH=(232,232,228); WH2=(250,250,246); G=(178,180,182); G2=(104,108,114); G3=(72,76,82); RED=(120,24,30)
DK=(48,48,54)
def P(d,pts,c): d.polygon([(round(x),round(y)) for x,y in pts],fill=c)
def E(d,x0,y0,x1,y1,c): d.ellipse([round(x0),round(y0),round(x1),round(y1)],fill=c)
def R(d,x0,y0,x1,y1,c):
    x0,x1=sorted((round(x0),round(x1))); y0,y1=sorted((round(y0),round(y1)))
    if x1>x0 and y1>y0: d.rectangle([x0,y0,x1-1,y1-1],fill=c)
def outline(im,c=OL):
    a=np.asarray(im)[...,3]>0; e=np.zeros_like(a)
    e[1:]|=a[:-1]; e[:-1]|=a[1:]; e[:,1:]|=a[:,:-1]; e[:,:-1]|=a[:,1:]
    arr=np.asarray(im).copy(); arr[e&~a]=(*c,255); return Image.fromarray(arr,'RGBA')

def cabeza(d,b,turn=0):
    """cabeza vista de atrás: nuca y gorro grises, mejillas blancas, orejas en punta. turn: px que la cabeza gira hacia la derecha (hacia Adonay)."""
    hx=CX+turn
    for s in (-1,1):   # orejas
        bx=hx+s*6
        P(d,[(bx-s*3.5,11+b),(bx+s*0.5,1.5+b),(bx+s*3.5,11+b)],G2)
        P(d,[(bx-s*1.5,10+b),(bx+s*0.3,4+b),(bx+s*1.8,10+b)],G3)
    E(d,hx-10,6+b,hx+10,24+b,G2)                       # cráneo (nuca)
    P(d,[(hx-3,6+b),(hx+3,6+b),(hx+2,17+b),(hx-2,17+b)],G3)   # gorro oscuro central
    for s in (-1,1):                                    # mejillas blancas que asoman por los lados
        E(d,hx+s*9-2.5,16+b,hx+s*9+2.5,23+b,WH)
    if turn:                                            # al girar asoma el hocico blanco y un ojo azul del lado de Adonay
        E(d,hx+9,15+b,hx+14,21+b,WH); d.point((hx+9,15+b),fill=(84,170,222))
    E(d,hx-8,17+b,hx+8,25+b,G2)
def collar(d,b): R(d,CX-9,23+b,CX+10,26+b,RED); d.point((CX,26+b),fill=(176,170,160))

def cola_anillo(cx,cy):
    """cola de husky en hoz enroscada sobre el lomo: sube desde la grupa, se curva y la punta cae hacia un lado."""
    t=Image.new('RGBA',(W,H),(0,0,0,0)); d=ImageDraw.Draw(t)
    path=[(0,10),(2,7),(3.5,3.5),(3.5,0),(2,-3),(-1,-4.5),(-4,-3.5),(-5.5,-1)]
    rr=[3,3.2,3.4,3.4,3.2,3,2.6,2.2]
    for (x,y),r in zip(path,rr): E(d,cx+x-r,cy+y-r,cx+x+r,cy+y+r,WH)
    for (x,y),r in zip(path[1:5],rr[1:5]): E(d,cx+x+r*0.2,cy+y-r*0.2,cx+x+r,cy+y+r*0.6,G)       # sombra del lado derecho
    for (x,y) in path[4:7]: E(d,cx+x-1.5,cy+y-1.8,cx+x+0.5,cy+y,WH2)                            # luz arriba
    return outline(t)
def de_pie(lh=0,rh=0,lf=0,rf=0,bob=0,cola=0,turn=0):
    """lh/rh: elevación de pata trasera izq/der; lf/rf: delanteras (asoman entre las traseras); cola: vaivén lateral."""
    im=Image.new('RGBA',(W,H),(0,0,0,0)); d=ImageDraw.Draw(im); b=-bob
    # patas delanteras (más lejos: asoman entre las traseras, apoyan 2 filas más arriba)
    for s,lift in ((-1,lf),(1,rf)):
        x=CX+s*4.5; R(d,x-2.5,44+b,x+2.5,62-lift,WH); R(d,x+(0.5 if s>0 else -2.5),46+b,x+(2.5 if s>0 else -0.5),62-lift,G)
    # ancas blancas (muslos) + panza clara
    E(d,CX-13,33+b,CX+1,52+b,WH); E(d,CX-1,33+b,CX+13,52+b,WH)
    E(d,CX-11,40+b,CX-5,49+b,WH2); E(d,CX+5,40+b,CX+11,49+b,G)           # luz izq., sombra der.
    R(d,CX-2,45+b,CX+2,50+b,G)
    # manto gris del husky: lomo y parte alta de las ancas (encima de los muslos), borde inferior curvo
    P(d,[(CX-9,26+b),(CX+9,26+b),(CX+12.5,35+b),(CX+12,40+b),(CX+6,42+b),(CX,41+b),(CX-6,42+b),(CX-12,40+b),(CX-12.5,35+b)],G2)
    P(d,[(CX-3,26+b),(CX+3,26+b),(CX+3,39+b),(CX-3,39+b)],G3)            # raya dorsal oscura
    # patas traseras
    for s_,lift in ((-1,lh),(1,rh)):
        x=CX+s_*7.5; top=48+b; bot=FEET-lift
        R(d,x-3,top,x+3,bot,WH); R(d,x+(1 if s_>0 else -3),top+2,x+(3 if s_>0 else -1),bot,G)
        R(d,x-3,bot-2,x+3,bot,G if lift else WH2)
        if lift: R(d,x-2,bot-1,x+2,bot,DK)
    cabeza(d,b,turn); collar(d,b)
    im=outline(im); im.alpha_composite(cola_anillo(CX+1+cola,33+b)); return im

def sentado(cola=0):
    """sentado de espaldas: ancas abiertas en el suelo, torso erguido (más manto visible), cola apoyada en el suelo a un lado."""
    im=Image.new('RGBA',(W,H),(0,0,0,0)); d=ImageDraw.Draw(im)
    # cola en el suelo, hacia la izquierda
    E(d,1+cola,55,16+cola,64,WH); E(d,4+cola,58,9+cola,62,G)
    # patas delanteras asomando delante, abajo
    for s in (-1,1): x=CX+s*5; R(d,x-2.5,50,x+2.5,62,WH); R(d,x+(0.5 if s>0 else -2.5),52,x+(2.5 if s>0 else -0.5),62,G)
    # torso erguido
    P(d,[(CX-9,25),(CX+9,25),(CX+12,38),(CX+13,50),(CX-13,50),(CX-12,38)],G2)
    P(d,[(CX-3,25),(CX+3,25),(CX+4,46),(CX-4,46)],G3)
    # ancas abiertas apoyadas
    E(d,CX-16,44,CX+1,64,WH); E(d,CX-1,44,CX+16,64,WH)
    E(d,CX-14,47,CX-6,58,WH2); E(d,CX+6,47,CX+14,58,G)
    R(d,CX-16,61,CX-9,64,WH2); R(d,CX+9,61,CX+16,64,WH)                 # patas traseras dobladas (pies hacia fuera)
    R(d,CX-2,52,CX+2,64,G2)
    cabeza(d,-1,0); collar(d,-1)
    return outline(im)

FRAMES={'idle':[dict(cola=0),dict(cola=1,bob=1)],
        'walk':[dict(lh=4,rf=3,cola=-1),dict(bob=1),dict(rh=4,lf=3,cola=1),dict(bob=1)],
        'sit':['sit']}
def frame(p): return sentado() if p=='sit' else de_pie(**p)
def tira(nombre):
    fr=[frame(p) for p in FRAMES[nombre]]; s=Image.new('RGBA',(W*len(fr),H),(0,0,0,0))
    for i,f in enumerate(fr): s.alpha_composite(f,(i*W,0))
    return s
