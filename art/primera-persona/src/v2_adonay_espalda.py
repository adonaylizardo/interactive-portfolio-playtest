"""Adonay de ESPALDA para la cámara en tercera persona (over-the-shoulder).
Pixel-art dibujado a resolución de arte 96x150 (personaje = 144 filas = 1,78 m), sin antialias,
con la paleta exacta de los sprites del mapa (forge-paquete/personaje/adonay). Salida @1x = arte x2, @2x = arte x4."""
from PIL import Image, ImageDraw
import numpy as np, math
W,H=96,150; FEET=148; CX=48
# paleta tomada de adonay__idle_ne@1x.png (+1 sombra de piel añadida)
HAIR=(30,30,34); HAIR_D=(16,16,18); HAIR_L=(48,48,54); HAIR_B=(40,34,31)
SKIN=(201,156,128); SKIN_L=(232,196,168); SKIN_D=(168,124,100)
SH=(196,174,136); SH_D=(150,128,96); SH_L=(222,204,166); SH_O=(92,70,40); SH_OO=(62,52,46)
PA=(24,20,19); PA_D=(18,14,12); PA_L=(40,34,31); PA_O=(16,16,18)
SO=(200,152,40); SO_D=(150,108,24); SO_L=(232,190,80); SOLE=(236,232,220); SOLE_D=(190,184,172)
RED=(168,40,44)

def _poly(d,pts,c): d.polygon([(round(x),round(y)) for x,y in pts],fill=c)
def _rect(d,x0,y0,x1,y1,c):
    x0,x1=sorted((round(x0),round(x1))); y0,y1=sorted((round(y0),round(y1)))
    if x1>x0 and y1>y0: d.rectangle([x0,y0,x1-1,y1-1],fill=c)

def outline(im,c,src_alpha=None):
    a=np.asarray(im)[...,3]>0
    e=np.zeros_like(a)
    e[1:]|=a[:-1]; e[:-1]|=a[1:]; e[:,1:]|=a[:,:-1]; e[:,:-1]|=a[:,1:]
    ring=e&~a
    arr=np.asarray(im).copy(); arr[ring]=(*c,255)
    return Image.fromarray(arr,'RGBA')

def personaje(lf=0,rf=0,la=0,ra=0,bob=0):
    """lf/rf: elevación del talón izq/der (px de arte); la/ra: avance del brazo (+ = hacia delante, la mano sube);
    bob: subida del cuerpo."""
    im=Image.new('RGBA',(W,H),(0,0,0,0)); d=ImageDraw.Draw(im)
    b=-bob
    # ---------- pantalón culotte ancho (por piernas) ----------
    legs=Image.new('RGBA',(W,H),(0,0,0,0)); dl=ImageDraw.Draw(legs)
    for side,lift in ((-1,lf),(1,rf)):
        hem=140-lift*0.8
        xin=CX+side*1; xout=CX+side*25
        top=97+b
        pts=[(CX+side*0,top),(CX+side*19,top),(xout,hem),(CX+side*3,hem),(CX+side*1,118+b)]
        _poly(dl,pts,PA)
        # pliegues verticales (luces de la tela)
        for k,fx in enumerate((0.35,0.62,0.85)):
            x0=CX+side*(3+fx*15); x1=CX+side*(3+fx*21)
            dl.line([(round(x0),top+8),(round(x1),round(hem)-2)],fill=PA_L if k!=1 else PA_D)
        # dobladillo
        dl.line([(round(CX+side*2),round(hem)-1),(round(xout),round(hem)-1)],fill=PA_D)
    dl.line([(CX,112+b),(CX,141)],fill=PA_O); dl.line([(CX-1,124+b),(CX-1,141)],fill=PA_D)
    legs=outline(legs,PA_O)
    # ---------- zapatillas (Converse mostaza, talón visible) ----------
    for side,lift in ((-1,lf),(1,rf)):
        x0=CX+side*5 if side>0 else CX-19; x1=x0+14
        y1=FEET-lift; y0=y1-10+ (1 if lift else 0)
        _rect(d,x0,y0,x1,y1,SO); _rect(d,x0,y0,x1,y0+3,SO_L)
        _rect(d,x1-4 if side>0 else x0,y0+3,x1 if side>0 else x0+4,y1-4,SO_D)
        _rect(d,x0+5,y0+1,x1-5,y1-5,SO_D)          # contrafuerte del talón
        sole_h=3+(2 if lift else 0)
        _rect(d,x0,y1-sole_h,x1,y1,SOLE); _rect(d,x0,y1-1,x1,y1,SOLE_D)
    im.alpha_composite(legs)
    d=ImageDraw.Draw(im)
    # ---------- brazos (detrás del torso en los bordes) ----------
    def brazo(side,adv):
        sx=CX+side*24
        hy=97-adv*0.8+b; hx=sx+side*(2-adv*0.25)
        # manga (sobrecamisa, manga 3/4 remangada)
        _poly(d,[(sx-side*1,52+b),(sx+side*7,56+b),(hx+side*4,76+b-adv*0.4),(hx-side*4,77+b-adv*0.4)],SH_D)
        _poly(d,[(sx-side*1,52+b),(sx+side*4,54+b),(hx+side*1,76+b-adv*0.4),(hx-side*4,77+b-adv*0.4)],SH)
        _rect(d,min(hx-side*5,hx+side*4),76+b-adv*0.4,max(hx-side*5,hx+side*4)+1,80+b-adv*0.4,SH_L)   # puño remangado
        # antebrazo y mano
        x0=min(hx-side*3,hx+side*3); x1=max(hx-side*3,hx+side*3)+1
        _rect(d,x0,80+b-adv*0.4,x1,hy,SKIN)
        _rect(d,(x1-2) if side>0 else x0,80+b-adv*0.4,(x1) if side>0 else x0+2,hy,SKIN_D)
        _poly(d,[(x0-1,hy-1),(x1+1,hy-1),(x1,hy+7),(x0,hy+7)],SKIN)
        _rect(d,(x1-2) if side>0 else x0,hy,(x1+1) if side>0 else x0+1,hy+6,SKIN_D)
        _rect(d,x0+1,hy+5,x1-1,hy+8,SKIN_L if side<0 else SKIN)
        if side<0: _rect(d,x0,hy-6,x1,hy-4,RED)       # pulsera roja (muñeca izquierda)
    brazo(-1,la); brazo(1,ra)
    # ---------- torso: sobrecamisa arena con tablón trasero ----------
    tor=[(26,51+b),(70,51+b),(71,72+b),(69,99+b),(27,99+b),(25,72+b)]
    _poly(d,tor,SH)
    _poly(d,[(58,60+b),(70,51+b),(71,72+b),(69,99+b),(60,99+b)],SH_D)     # lado en sombra
    _poly(d,[(27,52+b),(40,52+b),(37,62+b),(28,64+b)],SH_L)               # hombro iluminado
    # canesú y tablón
    d.line([(27,62+b),(69,62+b)],fill=SH_O)
    d.line([(28,63+b),(68,63+b)],fill=SH_L)
    _rect(d,43,63+b,53,99+b,SH_L); d.line([(42,63+b),(42,98+b)],fill=SH_O); d.line([(53,63+b),(53,98+b)],fill=SH_O)
    d.line([(47,66+b),(47,98+b)],fill=SH)
    for x in (34,62): d.line([(x,64+b),(x+1,98+b)],fill=SH_D if x>50 else SH)
    d.line([(33,64+b),(33,98+b)],fill=SH_L)
    # arrugas a la altura de la cintura
    for x0,x1,y in ((30,40,88),(55,66,90),(36,44,93)): d.line([(x0,y+b),(x1,y+1+b)],fill=SH_D)
    _rect(d,27,96+b,69,99+b,SH_D)
    # cuello de la camisa
    _poly(d,[(38,48+b),(58,48+b),(61,53+b),(35,53+b)],SH_O)
    _poly(d,[(39,49+b),(57,49+b),(59,52+b),(37,52+b)],SH_D)
    # ---------- cuello (piel) ----------
    _rect(d,42,39+b,54,49+b,SKIN); _rect(d,42,39+b,45,49+b,SKIN_D); _rect(d,51,40+b,54,49+b,SKIN_D)
    # ---------- cabeza: orejas, barba lateral, pelo rizado voluminoso ----------
    for side in (-1,1):
        ex=CX+side*14
        _rect(d,min(ex,ex+side*3),23+b,max(ex,ex+side*3)+1,33+b,SKIN)
        _rect(d,min(ex,ex+side*3),29+b,max(ex,ex+side*3)+1,33+b,SKIN_D)
        # barba asomando por la mandíbula
        _poly(d,[(CX+side*14,33+b),(CX+side*16,33+b),(CX+side*12,42+b),(CX+side*9,42+b)],HAIR_B)
    hair=Image.new('RGBA',(W,H),(0,0,0,0)); dh=ImageDraw.Draw(hair)
    dh.ellipse([33,4+b,63,34+b],fill=HAIR)
    _poly(dh,[(35,22+b),(61,22+b),(58,37+b),(38,37+b)],HAIR)                 # nuca
    rng=np.random.default_rng(7)
    for t in np.linspace(0,2*math.pi,26,endpoint=False):                     # rizos del contorno
        if math.sin(t)>0.55: continue
        x=48+15*math.cos(t); y=19+b-15*math.sin(t)
        r=2.5 if math.sin(t)<-0.2 else 2
        dh.ellipse([x-r,y-r,x+r,y+r],fill=HAIR)
    hair=outline(hair,HAIR_D)
    dh=ImageDraw.Draw(hair)
    # textura de rizos: arcos claros y oscuros en racimos
    pts=[(x,y) for y in range(7,35,4) for x in range(35,62,5)]
    for i,(x,y) in enumerate(pts):
        x+=(y//4)%2*2; yy=y+b
        if (x-48)**2/15**2+(yy-19-b)**2/15**2>0.85: continue
        col=HAIR_L if (y<22 and x<52) or rng.random()<0.25 else HAIR_D
        dh.arc([x-2,yy-2,x+2,yy+2],200,340,fill=col)
        if rng.random()<0.5: dh.point((x+1,yy+2),fill=HAIR_D)
    _rect(dh,40,35+b,56,37+b,HAIR_D)                                        # borde de la nuca
    im.alpha_composite(hair)
    return outline(im,(14,12,12))

FRAMES={
 'idle':[dict(),dict(bob=1)],
 'walk':[dict(lf=5,la=-6,ra=7,bob=0),dict(bob=2,la=0,ra=0),dict(rf=5,la=7,ra=-6,bob=0),dict(bob=2)],
}
def tira(nombre):
    fr=[personaje(**p) for p in FRAMES[nombre]]
    s=Image.new('RGBA',(W*len(fr),H),(0,0,0,0))
    for i,f in enumerate(fr): s.alpha_composite(f,(i*W,0))
    return s
