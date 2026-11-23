# JAC T9 exterior para primera persona (BORRADOR): lado (pasajero, nariz a la derecha), trasera y frente.
# Pintado en metros con B.Pn. Densidad de la pieza "cerca": 192 px/m @1x (escala 1 a z = 914/192 = 4,76 m).
import math, numpy as np
from PIL import Image, ImageDraw
import build_primera_persona as B
C=B.C; K=B.K
D_NEAR=192
# paleta del T9 (Graphite Grey de noche, dentro del kit grafito)
BODY=(68,71,78); BODY_LO=(55,58,64); BODY_HI=(86,90,98); CREASE=(112,116,124); TOP=(80,84,92)
CLAD=(26,27,30); CLAD_HI=(46,48,54); TRIM=(14,15,17); OUT=(12,13,15)
GLASS=(15,17,22); GLASS_R=(32,36,46); SEAT=(52,49,44)
TIRE=(17,17,19); SIDEW=(32,33,37); RIM_D=(36,38,43); RIM_S=(128,132,140); DISC=(24,24,27)
CHR=(150,154,162); CHR_D=(96,100,108)
LED_OFF=(66,70,78); LED_ON=(226,234,244); LENS_OFF=(30,32,38)
RED_OFF=(72,24,30); RED_ON=(206,40,48); RED_MID=(150,30,38)
COOL=(120,140,176)
JAC={'J':["00111","00010","00010","00010","10010","10010","01100"],
     'A':["01110","10001","10001","11111","10001","10001","10001"],
     'C':["01111","10000","10000","10000","10000","10000","01111"],
     'T':["11111","00100","00100","00100","00100","00100","00100"],
     '9':["01110","10001","10001","01111","00001","00010","01100"],
     '4':["00010","00110","01010","10010","11111","00010","00010"],
     'W':["10001","10001","10001","10101","10101","11011","10001"],
     'D':["11110","10001","10001","10001","10001","10001","11110"]}

def ell(pn,u,v,r,fill=None,line=None,w=1.0,rv=None):
    x,y=pn.p(u,v); rx=abs(r*pn.s); ry=abs((rv if rv else r)*pn.s)
    pn.d.ellipse([x-rx,y-ry,x+rx,y+ry],fill=fill,outline=line,width=max(1,int(pn.lw*w)) if line else 0)
def arc_pts(u,v,r,a0,a1,n=40): return [(u+r*math.cos(math.radians(a)),v+r*math.sin(math.radians(a))) for a in np.linspace(a0,a1,n)]
def text(pn,s,u,v,h,col,gap=1):
    """texto pixel 5×7; (u,v) = esquina inferior izquierda; h = alto en m"""
    c=h/7
    for i,ch in enumerate(s):
        g=JAC[ch]
        for r,row in enumerate(g):
            for k,b in enumerate(row):
                if b=='1': pn.rect(u+(i*(5+gap)+k)*c,v+(6-r)*c,u+(i*(5+gap)+k+1)*c,v+(7-r)*c,col,None)
def tw(s,h,gap=1): return len(s)*(5+gap)*h/7-gap*h/7
def glow(pn,u,v,r,col,a=(40,24,12)):
    lay=Image.new('RGBA',pn.im.size,(0,0,0,0)); d=ImageDraw.Draw(lay); x,y=pn.p(u,v)
    for k,al in enumerate(a):
        rr=abs(r*pn.s)*(1+k*0.7); d.ellipse([x-rr,y-rr*0.8,x+rr,y+rr*0.8],fill=col+(al,))
    pn.im.alpha_composite(lay); pn.refresh()

# ---------------- rueda vista de lado (rin flor/Y bicolor de 6 rayos) ----------------
def rueda(pn,u,v=0.40,spin=0):
    ell(pn,u,v,0.40,TIRE,OUT); ell(pn,u,v,0.36,None,SIDEW,1.0); ell(pn,u,v,0.245,RIM_D,TRIM)
    ell(pn,u,v,0.20,DISC,None)
    for k in range(6):
        a=math.radians(spin+k*60); b1=a-0.16; b2=a+0.16
        p=lambda r,t:(u+r*math.cos(t),v+r*math.sin(t))
        pn.poly([p(0.06,a-0.35),p(0.13,a-0.10),p(0.225,b1-0.10),p(0.235,b1+0.02),p(0.15,a),p(0.235,b2-0.02),p(0.225,b2+0.10),p(0.13,a+0.10),p(0.06,a+0.35)],RIM_S,None)
        pn.line([p(0.13,a),p(0.22,a)],RIM_D,1.0)            # canal oscuro del rayo (bicolor)
    ell(pn,u,v,0.245,None,(70,74,82),1.0)
    ell(pn,u,v,0.062,RIM_D,CHR_D); ell(pn,u,v,0.03,CHR,None)
    for k in range(6):
        a=math.radians(spin+30+k*60); ell(pn,u+0.085*math.cos(a),v+0.085*math.sin(a),0.011,TRIM,None)

# ---------------- LADO (lado pasajero, nariz a la derecha). u=0 centro del carro, v=0 suelo ----------------
LADO=dict(u0=-2.74,u1=2.74,v1=1.93)
UF,UR=1.70,-1.48
def t9_lado(pn,luces=False):
    # sombra de contacto
    pn.rect(-2.4,-0.03,2.45,0.03,(8,8,10,200),None)
    # tapa del platón (lona negra vista desde 1,78 m) y capó visto desde arriba: superficies superiores
    pn.poly([(-2.60,1.15),(-1.42,1.15),(-1.42,1.33),(-2.56,1.30)],(19,20,23),TRIM)
    pn.poly([(1.02,1.22),(2.30,1.18),(2.58,1.15),(2.52,1.25),(1.12,1.335)],TOP,None)
    pn.line([(1.20,1.30),(2.40,1.225)],BODY_HI,1.0)        # pliegue del capó
    # carrocería
    body=[(-2.64,0.60),(-2.665,0.64),(-2.665,1.13),(-2.60,1.17),(-1.42,1.17),(-1.42,1.20),(-1.36,1.79),(-1.22,1.84),
          (0.04,1.84),(0.22,1.815),(1.02,1.24),(2.30,1.20),(2.58,1.17),(2.665,1.09),(2.665,0.70),(2.60,0.60)]
    pn.poly(body,BODY,None)
    pn.poly([(-2.64,0.60),(-2.665,0.64),(-2.665,0.80),(2.665,0.80),(2.665,0.70),(2.60,0.60)],BODY_LO,None)
    pn.poly([(-2.665,1.04),(2.665,1.04),(2.665,1.09),(2.58,1.17),(2.30,1.20),(1.02,1.24),(-1.42,1.20),(-1.42,1.17),(-2.60,1.17),(-2.665,1.13)],BODY_HI,None)
    pn.line([(-2.64,1.045),(2.62,1.045)],CREASE,1.0)       # línea de cintura (filo de luz)
    pn.line([(-2.60,1.17),(-1.42,1.17)],CREASE,1.0)        # borde del platón
    pn.line([(1.02,1.24),(2.30,1.20),(2.58,1.17)],CREASE,1.0)
    pn.line([(-1.22,1.84),(0.04,1.84),(0.22,1.815)],CREASE,1.0)
    # pliegue inferior esculpido en las puertas (sube hacia atrás) + reflejo del horizonte
    pn.line([(1.62,0.70),(-1.32,0.80)],(40,42,48),1.0); pn.line([(1.62,0.715),(-1.32,0.815)],BODY_HI,1.0)
    pn.line([(-1.30,0.935),(1.70,0.935)],(76,80,88),1.0)
    # hendidura del platón (línea de estampado)
    pn.line([(-2.55,0.86),(-1.55,0.86)],BODY_LO,1.0)
    # ventanas (DLO) con marco negro
    dlo=[(-1.25,1.30),(-1.25,1.74),(-1.13,1.785),(0.02,1.785),(0.16,1.765),(0.92,1.30)]
    pn.poly(dlo,TRIM,None)
    g=[(-1.21,1.33),(-1.21,1.72),(-1.11,1.755),(0.00,1.755),(0.13,1.737),(0.84,1.33)]
    pn.poly(g,GLASS,None)
    # interior tenue: cabeceras beige y reflejo diagonal del cielo
    for uu in (0.30,-0.78):
        pn.poly([(uu-0.10,1.47),(uu+0.10,1.47),(uu+0.11,1.60),(uu+0.08,1.63),(uu-0.08,1.63),(uu-0.11,1.60)],SEAT,None)
    pn.poly([(-0.55,1.33),(-0.40,1.33),(-0.05,1.755),(-0.20,1.755)],GLASS_R,None)
    pn.poly([(0.30,1.33),(0.36,1.33),(0.62,1.62),(0.58,1.66)],GLASS_R,None)
    pn.rect(-0.12,1.30,-0.02,1.785,TRIM,None)               # pilar B negro
    pn.line([(0.92,1.30),(0.16,1.765)],TRIM,2.0)            # pilar A
    pn.hline(-1.25,0.92,1.30,CHR_D,1.0)                     # moldura cromada de la cintura de vidrio
    if luces:
        glow(pn,0.70,1.36,0.08,COOL,(30,16,8)); pn.rect(0.66,1.34,0.76,1.38,(70,84,110),None)
    # barras de techo
    pn.rect(-1.15,1.84,0.00,1.87,TRIM,None); pn.line([(-1.15,1.87),(0.0,1.87)],(52,55,62),1.0)
    for uu in (-1.12,-0.03): pn.rect(uu-0.03,1.835,uu+0.03,1.875,TRIM,None)
    # puertas
    pn.line([(0.92,1.30),(1.06,0.62)],TRIM,1.0); pn.line([(-0.07,1.30),(-0.07,0.58)],TRIM,1.0); pn.line([(-1.25,1.30),(-1.25,0.86),(-1.18,0.62)],TRIM,1.0)
    for uu in (0.62,-0.62): pn.rect(uu-0.08,1.00,uu+0.08,1.03,CHR,TRIM)
    # espejo lateral (carcasa negra) sobre la puerta
    pn.poly([(0.80,1.31),(0.98,1.31),(1.00,1.45),(0.84,1.48),(0.78,1.44)],TRIM,OUT); pn.line([(0.82,1.46),(0.97,1.44)],(52,55,62),1.0)
    # cristal de faros vistos de lado: tira LED fina arriba + bloque principal abajo, en la esquina
    pn.rect(2.50,1.045,2.665,1.075,LED_ON if luces else LED_OFF,None)
    pn.rect(2.48,0.70,2.665,0.86,TRIM,None); pn.rect(2.51,0.73,2.65,0.83,LED_ON if luces else LENS_OFF,None)
    if luces: glow(pn,2.66,1.02,0.07,(210,224,240)); glow(pn,2.66,0.78,0.10,(210,224,240))
    # emblema lateral cromado en el guardafango
    pn.rect(2.02,0.93,2.20,0.96,CHR_D,None)
    # cola: piloto vertical
    pn.rect(-2.665,0.84,-2.62,1.12,RED_ON if luces else RED_OFF,None)
    if luces: glow(pn,-2.66,0.98,0.08,(200,40,48),(34,18,8))
    # parachoques
    pn.poly([(2.28,0.62),(2.60,0.60),(2.665,0.70),(2.70,0.66),(2.70,0.40),(2.62,0.30),(2.20,0.30),(2.15,0.46)],CLAD,OUT)
    pn.rect(2.45,0.30,2.66,0.36,(92,96,104),None)          # protector inferior plateado
    pn.rect(-2.72,0.36,-2.28,0.64,CLAD,OUT); pn.line([(-2.72,0.64),(-2.28,0.64)],CLAD_HI,1.0)
    # zócalo negro y estribo
    pn.rect(-1.00,0.50,1.22,0.60,CLAD,None)
    pn.rect(-0.98,0.38,1.18,0.45,TRIM,OUT); pn.line([(-0.98,0.45),(1.18,0.45)],(110,114,122),1.0)
    for uu in (-0.6,0.4): pn.rect(uu-0.03,0.45,uu+0.03,0.52,TRIM,None)
    # pasos de rueda + molduras (flares) negras
    for uu in (UF,UR):
        pn.poly(arc_pts(uu,0.40,0.50,-8,188),(8,8,10),None)
        fl=arc_pts(uu,0.40,0.565,-12,192)+arc_pts(uu,0.40,0.49,192,-12)
        pn.poly(fl,CLAD,OUT); pn.line(arc_pts(uu,0.40,0.56,10,170,30),CLAD_HI,1.0)
        rueda(pn,uu)
    # barra deportiva negra (roll bar) + rieles laterales del platón
    def tubo(pts,w=3.0):
        pn.line(pts,TRIM,w+1.5); pn.line(pts,(22,23,26),w); pn.line([(a,b+0.012) for a,b in pts],(56,59,66),1.0)
    tubo([(-1.60,1.17),(-1.56,1.70),(-1.52,1.86),(-1.95,1.86),(-2.12,1.62),(-2.40,1.30),(-2.44,1.17)],5.0)
    tubo([(-1.95,1.86),(-1.98,1.17)],3.0)
    pn.rect(-1.80,1.66,-1.58,1.78,(20,21,24),None); text(pn,'JAC',-1.775,1.69,0.06,(92,96,104))
    tubo([(-1.45,1.24),(-2.58,1.24)],2.5)
    for uu in (-1.70,-2.20,-2.55): pn.rect(uu-0.015,1.17,uu+0.015,1.24,TRIM,None)
    # contorno de la silueta
    pn.poly(body,None,OUT,1.0)

# ---------------- TRASERA ----------------
TRAS=dict(u0=-1.12,u1=1.12,v1=1.93)
def t9_trasera(pn,luces=False):
    pn.rect(-1.0,-0.03,1.0,0.03,(8,8,10,200),None)
    for s in (-1,1):                                                          # cauchos
        pn.rect(s*0.70,0.0,s*0.96,0.44,TIRE,OUT); pn.line([(s*0.74,0.04),(s*0.74,0.40)],SIDEW,1.0)
    pn.rect(-0.70,0.18,0.70,0.40,(9,9,11),None)                               # bajos
    pn.rect(-0.10,0.24,0.10,0.30,(30,31,34),None)                             # escape/enganche
    # cabina detrás (pared trasera + ventana + 3.ª luz)
    pn.poly([(-0.80,1.17),(0.80,1.17),(0.78,1.80),(0.66,1.845),(-0.66,1.845),(-0.78,1.80)],BODY,OUT)
    pn.line([(-0.66,1.845),(0.66,1.845)],CREASE,1.0)
    pn.poly([(-0.58,1.40),(0.58,1.40),(0.56,1.72),(-0.56,1.72)],TRIM,None); pn.poly([(-0.54,1.43),(0.54,1.43),(0.52,1.69),(-0.52,1.69)],GLASS,None)
    pn.poly([(-0.20,1.43),(-0.08,1.43),(0.10,1.69),(-0.02,1.69)],GLASS_R,None)
    for s in (-1,1):
        pn.poly([(s*0.20,1.47),(s*0.40,1.47),(s*0.41,1.60),(s*0.21,1.60)],SEAT,None)
    pn.rect(-0.16,1.765,0.16,1.79,RED_MID if luces else RED_OFF,None)
    for s in (-1,1): pn.rect(s*0.50-0.03,1.845,s*0.50+0.03,1.875,TRIM,None)
    # lona del platón vista desde arriba
    pn.poly([(-0.96,1.14),(0.96,1.14),(0.90,1.26),(-0.90,1.26)],(19,20,23),TRIM)
    # barra deportiva vista de atrás: arco + 2 barras interiores
    def tubo(pts,w=4.0):
        pn.line(pts,TRIM,w+1.5); pn.line(pts,(22,23,26),w); pn.line([(a,b+0.012) for a,b in pts],(56,59,66),1.0)
    hoop=[(-0.84,1.17),(-0.84,1.70)]+arc_pts(-0.72,1.74,0.12,180,90,8)+arc_pts(0.72,1.74,0.12,90,0,8)+[(0.84,1.70),(0.84,1.17)]
    tubo(hoop,6.0)
    for uu in (-0.28,0.28): tubo([(uu,1.20),(uu,1.86)],4.0)
    for s in (-1,1): tubo([(s*0.84,1.40),(s*0.98,1.20)],4.0)
    # carrocería: compuerta + costados del platón
    pn.poly([(-0.98,0.62),(0.98,0.62),(0.98,1.12),(0.94,1.17),(-0.94,1.17),(-0.98,1.12)],BODY,None)
    pn.rect(-0.98,0.62,0.98,0.76,BODY_LO,None)
    pn.rect(-0.86,1.06,0.86,1.12,BODY_HI,None); pn.line([(-0.94,1.165),(0.94,1.165)],CREASE,1.0)
    pn.line([(-0.86,0.66),(-0.86,1.12)],TRIM,1.0); pn.line([(0.86,0.66),(0.86,1.12)],TRIM,1.0); pn.hline(-0.86,0.86,0.66,TRIM,1.0)
    pn.rect(-0.13,1.00,0.13,1.05,TRIM,(40,42,48))                            # manilla
    # J A C embutido (relieve: luz arriba-izq., sombra abajo-der.)
    h=0.17; tot=0.0
    for i,ch in enumerate('JAC'):
        uu=-0.62+i*0.50
        text(pn,ch,uu+0.014,0.763,h,(38,40,46),0); text(pn,ch,uu,0.777,h,(112,116,124),0); text(pn,ch,uu+0.006,0.771,h,BODY,0)
    text(pn,'T9',0.58,1.075,0.035,CHR); text(pn,'4WD',-0.80,0.70,0.03,CHR_D)
    # pilotos verticales con segmentos LED
    for s in (-1,1):
        x0,x1=sorted((s*0.86,s*0.985))
        pn.rect(x0,0.80,x1,1.14,TRIM,None); pn.rect(x0+0.012,0.82,x1-0.012,1.12,RED_ON if luces else RED_OFF,None)
        for vv in np.arange(0.85,1.11,0.05): pn.hline(x0+0.02,x1-0.02,vv,(110,26,34) if not luces else (240,96,104),0.8)
        if luces: glow(pn,(x0+x1)/2,0.97,0.10,(200,40,48),(34,18,8))
    # molduras laterales
    for s in (-1,1): pn.poly([(s*0.98,0.42),(s*1.02,0.46),(s*1.02,0.92),(s*0.98,0.95)],CLAD,OUT)
    # parachoques negro con peldaño, reflectivos rojos y placa
    pn.poly([(-1.00,0.36),(1.00,0.36),(1.00,0.64),(-1.00,0.64)],CLAD,OUT); pn.hline(-1.0,1.0,0.64,CLAD_HI,1.0)
    pn.rect(-0.30,0.58,0.30,0.64,(36,37,41),None)
    for s in (-1,1): x0,x1=sorted((s*0.72,s*0.86)); pn.rect(x0,0.47,x1,0.51,(110,28,36) if not luces else RED_MID,None)
    pn.rect(-0.27,0.42,0.27,0.56,(24,25,28),None); pn.rect(-0.25,0.44,0.25,0.545,(84,88,94),TRIM)
    if luces: pn.hline(-0.18,0.18,0.555,(200,210,224),1.0)
    pn.poly([(-0.98,0.62),(0.98,0.62),(0.98,1.12),(0.94,1.17),(-0.94,1.17),(-0.98,1.12)],None,OUT)

# ---------------- FRENTE ----------------
FRENTE=dict(u0=-1.16,u1=1.16,v1=1.93)
def t9_frente(pn,luces=False):
    pn.rect(-1.0,-0.03,1.0,0.03,(8,8,10,200),None)
    for s in (-1,1):
        pn.rect(s*0.70,0.0,s*0.96,0.42,TIRE,OUT); pn.line([(s*0.74,0.04),(s*0.74,0.38)],SIDEW,1.0)
    pn.rect(-0.70,0.16,0.70,0.34,(9,9,11),None)
    # cabina: parabrisas + pilares + techo (el techo queda casi de canto: ojo 1,78 m < techo 1,84 m)
    pn.poly([(-0.86,1.22),(0.86,1.22),(0.70,1.80),(0.62,1.845),(-0.62,1.845),(-0.70,1.80)],BODY,OUT)
    pn.line([(-0.62,1.845),(0.62,1.845)],CREASE,1.0)
    pn.poly([(-0.76,1.26),(0.76,1.26),(0.62,1.78),(-0.62,1.78)],TRIM,None)
    pn.poly([(-0.72,1.28),(0.72,1.28),(0.59,1.76),(-0.59,1.76)],GLASS,None)
    pn.poly([(-0.30,1.28),(-0.14,1.28),(0.02,1.76),(-0.12,1.76)],GLASS_R,None)
    for s in (-1,1): pn.poly([(s*0.22,1.40),(s*0.46,1.40),(s*0.47,1.56),(s*0.23,1.56)],SEAT,None)
    pn.rect(-0.05,1.68,0.05,1.74,(28,30,34),None)                             # retrovisor interior
    pn.line([(-0.62,1.30),(0.0,1.29)],(30,32,36),1.5); pn.line([(0.62,1.30),(0.0,1.29)],(30,32,36),1.5)  # plumillas
    for s in (-1,1): pn.rect(s*0.55-0.03,1.845,s*0.55+0.03,1.875,TRIM,None)
    # espejos
    for s in (-1,1):
        pn.poly([(s*0.84,1.30),(s*1.10,1.32),(s*1.12,1.46),(s*0.88,1.47)],TRIM,OUT); pn.line([(s*0.90,1.455),(s*1.09,1.445)],(52,55,62),1.0)
    # capó visto desde arriba
    pn.poly([(-0.90,1.12),(0.90,1.12),(0.84,1.23),(-0.84,1.23)],TOP,None); pn.line([(-0.30,1.13),(-0.26,1.22)],BODY_HI,1.0); pn.line([(0.30,1.13),(0.26,1.22)],BODY_HI,1.0)
    # frente de carrocería
    pn.poly([(-0.98,0.56),(0.98,0.56),(0.98,1.06),(0.90,1.12),(-0.90,1.12),(-0.98,1.06)],BODY,None)
    pn.rect(-0.98,0.56,0.98,0.70,BODY_LO,None)
    pn.line([(-0.90,1.12),(0.90,1.12)],CREASE,1.0)
    # parrilla alta y plana, panal hexagonal, barra con JAC
    pn.poly([(-0.58,0.56),(0.58,0.56),(0.54,1.09),(-0.54,1.09)],TRIM,(70,74,82))
    hw=0.078; hh=0.066
    for r in range(8):
        for c in range(-12,13):
            uu=c*hw*0.75; vv=0.60+r*hh+(hh/2 if c%2 else 0)
            if abs(uu)>0.48 or vv>0.92: continue
            pts=[(uu+hw*0.5*math.cos(math.radians(a)),vv+hh*0.5*math.sin(math.radians(a))) for a in range(0,360,60)]
            pn.poly(pts,(19,20,23),(54,57,64),1.0)
    pn.rect(-0.52,0.945,0.52,1.075,(16,17,20),None); pn.hline(-0.52,0.52,1.075,(90,94,102),1.0)
    w=tw('JAC',0.11,2); text(pn,'JAC',-w/2,0.955,0.11,(214,218,226),2)
    # luces partidas: tira LED fina arriba (al filo del capó) + bloque principal abajo en la esquina
    for s in (-1,1):
        pn.poly([(s*0.56,1.02),(s*0.93,1.04),(s*0.93,1.065),(s*0.56,1.05)],LED_ON if luces else LED_OFF,TRIM,0.8)
        x0,x1=sorted((s*0.60,s*0.95)); pn.rect(x0,0.58,x1,0.86,TRIM,None)
        a0,a1=sorted((s*0.64,s*0.92))
        pn.rect(a0,0.73,a1,0.83,LED_ON if luces else LENS_OFF,(70,74,82),0.8); pn.rect(a0,0.62,a1,0.70,(200,214,230) if luces else LENS_OFF,(70,74,82),0.8)
        if not luces:
            pn.hline(a0+0.02,a0+0.08,0.80,(80,84,92),1.0); pn.hline(a0+0.02,a0+0.06,0.68,(70,74,82),1.0)
        else:
            glow(pn,s*0.75,1.045,0.10,(210,224,240),(34,18,8)); glow(pn,s*0.78,0.76,0.16,(210,224,240),(40,22,10))
    # molduras y parachoques
    for s in (-1,1): pn.poly([(s*0.97,0.40),(s*1.02,0.44),(s*1.02,0.96),(s*0.97,1.00)],CLAD,OUT)
    pn.poly([(-1.0,0.32),(1.0,0.32),(1.0,0.58),(-1.0,0.58)],CLAD,OUT); pn.hline(-1.0,1.0,0.58,CLAD_HI,1.0)
    pn.rect(-0.42,0.28,0.42,0.36,(96,100,108),TRIM)                           # protector plateado
    pn.rect(-0.26,0.40,0.26,0.53,(24,25,28),None); pn.rect(-0.24,0.42,0.24,0.515,(84,88,94),TRIM)   # placa en blanco
    for s in (-1,1): x0,x1=sorted((s*0.66,s*0.86)); pn.rect(x0,0.40,x1,0.46,(30,32,36) if not luces else (150,160,176),TRIM)
    pn.poly([(-0.98,0.56),(0.98,0.56),(0.98,1.06),(0.90,1.12),(-0.90,1.12),(-0.98,1.06)],None,OUT)

T9EXT={'lado':(t9_lado,LADO),'trasera':(t9_trasera,TRAS),'frente':(t9_frente,FRENTE)}
