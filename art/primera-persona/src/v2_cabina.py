# Primera persona v2 (BORRADOR) · cabina JAC T9 según el carro real de Adonay (fotos SOLO como referencia, no se copian)
# Overlay 1280×720 @1x sin volante (luces on / off) + volante suelto (rota al doblar; ancla = centro del cubo).
import math, random
from PIL import Image, ImageDraw
import numpy as np
import build_primera_persona as B
K=B.K; W,H=B.W,B.H; C=B.C
OL=(58,61,68)
# volante: centro del cubo en pantalla @1x y geometría local (px @1x)
WHEEL_POS=(640,610)
WR,WT,WFLAT=228,26,190          # radio exterior, grosor del aro, fondo plano (y local)
WCAN=(464,426); WHUB=(232,232)  # lienzo del volante @1x y centro del cubo dentro del lienzo
# paleta extra (noche; cromo/plata apagados, nunca ámbar)
SIL=(124,128,136); SIL_HI=(170,174,182); SIL_LO=(84,88,96); CHROME=(108,112,120)
LEATHER=(17,18,21); BEIGE=(92,86,76); BEIGE2=(78,73,65)
RED=(168,44,50); RED_OFF=(78,34,38)
COOL=(132,150,182)
D3={'0':["111","101","101","101","111"],'1':["010","110","010","010","111"],'3':["111","001","111","001","111"],
    '9':["111","101","111","001","111"],'8':["111","101","111","101","111"],'5':["111","100","111","001","111"],
    'A':["010","101","111","101","101"],'U':["101","101","101","101","111"],'T':["111","010","010","010","010"],'O':["111","101","101","101","111"],
    'P':["110","101","110","100","100"]}

def fillet(pts,r,n=6):
    """polígono con esquinas redondeadas (Bézier cuadrática por esquina); r en las mismas unidades"""
    out=[]; m=len(pts)
    for i in range(m):
        A=np.array(pts[i-1],float); P=np.array(pts[i],float); Cc=np.array(pts[(i+1)%m],float)
        da=np.linalg.norm(A-P); dc=np.linalg.norm(Cc-P); rr=min(r,da/2,dc/2)
        p1=P+(A-P)*rr/da; p2=P+(Cc-P)*rr/dc
        for k in range(n+1):
            t=k/n; q=(1-t)**2*p1+2*(1-t)*t*P+t*t*p2; out.append((float(q[0]),float(q[1])))
    return out

class Scr:
    """pintor en coordenadas de pantalla @1x sobre un lienzo ×K"""
    def __init__(s,im,ox=0,oy=0): s.im=im; s.d=ImageDraw.Draw(im,'RGBA'); s.ox,s.oy=ox,oy
    def S(s,pts): return [((x+s.ox)*K,(y+s.oy)*K) for x,y in pts]
    def poly(s,pts,fill,line=OL,w=1,r=0):
        if r: pts=fillet(pts,r)
        if fill: s.d.polygon(s.S(pts),fill=fill)
        if line: s.d.line(s.S(pts+[pts[0]]),fill=line,width=max(1,int(K*w)),joint='curve')
    def rect(s,x0,y0,x1,y1,fill,line=None,w=1,r=0): s.poly([(x0,y0),(x1,y0),(x1,y1),(x0,y1)],fill,line,w,r)
    def line(s,pts,col,w=1): s.d.line(s.S(pts),fill=col,width=max(1,int(round(K*w))),joint='curve')
    def ell(s,cx,cy,rx,ry,fill=None,line=None,w=1):
        s.d.ellipse([(cx-rx+s.ox)*K,(cy-ry+s.oy)*K,(cx+rx+s.ox)*K,(cy+ry+s.oy)*K],fill=fill,outline=line,width=max(1,int(K*w)) if line else 0)
    def arc(s,cx,cy,r,a0,a1,col,w=1):
        s.d.arc([(cx-r+s.ox)*K,(cy-r+s.oy)*K,(cx+r+s.ox)*K,(cy+r+s.oy)*K],start=a0,end=a1,fill=col,width=max(1,int(K*w)))
    def px(s,x,y,col,n=1): s.d.rectangle([(x+s.ox)*K,(y+s.oy)*K,(x+n+s.ox)*K-1,(y+n+s.oy)*K-1],fill=col)
    def text3(s,x,y,txt,col,p=1):
        for i,ch in enumerate(txt):
            for r,row in enumerate(D3[ch]):
                for c,b in enumerate(row):
                    if b=='1': s.d.rectangle([(x+i*4*p+c*p+s.ox)*K,(y+r*p+s.oy)*K,(x+i*4*p+(c+1)*p+s.ox)*K-1,(y+(r+1)*p+s.oy)*K-1],fill=col)
    def tpoly(s,pts,rgba):
        """polígono translúcido compuesto encima (ImageDraw no mezcla alfa sobre RGBA)"""
        lay=Image.new('RGBA',s.im.size,(0,0,0,0)); ImageDraw.Draw(lay).polygon(s.S(pts),fill=rgba)
        s.im.alpha_composite(lay); s.d=ImageDraw.Draw(s.im,'RGBA')
    def glow(s,box,col,rings=((12,6),(7,11),(3,18)),r=8):
        """halo en 3 anillos duros con alfa baja (mismo lenguaje que los faroles)"""
        lay=Image.new('RGBA',s.im.size,(0,0,0,0)); g=Scr(lay,s.ox,s.oy)
        x0,y0,x1,y1=box
        for e,a in rings: g.rect(x0-e,y0-e,x1+e,y1+e,col+(a,),None,r=r+e)
        s.im.alpha_composite(lay); s.d=ImageDraw.Draw(s.im,'RGBA')

def topy(x):
    pts=[(0,612),(60,596),(300,582),(640,576),(980,582),(1220,596),(1280,610)]
    for (a,b),(c,d) in zip(pts,pts[1:]):
        if a<=x<=c: return b+(d-b)*(x-a)/(c-a)
    return 610

def cabina2(luces=True):
    im=Image.new('RGBA',(W*K,H*K),(0,0,0,0)); s=Scr(im); d=s.d
    # --- vidrios laterales, cintura, espejo lateral (igual que v1)
    s.poly([(0,40),(150,40),(98,330),(70,520),(58,600),(0,606)],(10,11,14,190),None)
    s.poly([(1068,44),(W,34),(W,612),(1218,604),(1172,584)],(10,11,14,190),None)
    s.poly([(0,520),(70,505),(66,540),(0,556)],(22,23,27))
    s.poly([(1180,500),(W,488),(W,524),(1188,532)],(22,23,27))
    s.poly([(60,470),(96,462),(92,512),(64,516)],(30,32,36))
    s.poly([(6,424),(74,412),(80,476),(10,490)],(52,54,60),(90,94,102))
    s.poly([(14,432),(66,422),(71,466),(17,478)],(16,18,22),None); s.line([(17,450),(69,440)],OL)
    # --- techo con techo panorámico (franja de vidrio + cortina) y parasoles
    s.poly([(0,0),(W,0),(W,34),(1040,46),(640,52),(240,46),(0,40)],(22,23,27))
    s.poly([(318,0),(962,0),(950,17),(330,17)],(31,34,41),OL)                 # vidrio del techo (cielo nocturno)
    s.poly([(318,0),(560,0),(560,17),(330,17)],(44,46,52),None)               # cortina corrida a medias
    s.line([(560,0),(560,17)],(70,74,82)); s.line([(330,18),(950,18)],(14,15,18))
    for x in (380,440,500): s.line([(x,3),(x+40,3)],(52,55,61),0.5)          # pliegues de la cortina
    s.poly([(250,42),(560,47),(560,74),(262,70)],(30,32,36))
    s.poly([(720,47),(1010,43),(1000,68),(720,73)],(30,32,36))
    s.line([(0,40),(240,46),(640,52),(1040,46),(W,34)],(44,46,52))
    # --- pilares A
    s.poly([(150,40),(252,46),(132,584),(60,600),(70,520),(98,330)],(26,28,32))
    s.line([(238,50),(122,578)],(44,46,52))
    s.poly([(1040,46),(1070,44),(1174,584),(1144,588)],(26,28,32))
    # --- plumillas
    for a,b in (((330,575),(690,568)),((738,569),(1050,574))):
        s.line([a,b],(10,11,13),4); s.line([(a[0],a[1]-2),(b[0],b[1]-2)],(40,42,47))
    # --- tablero: cara superior oscura con rejilla de desempañador
    top=[(0,612),(60,596),(300,582),(640,576),(980,582),(1220,596),(W,610)]
    s.poly(top+[(W,H),(0,H)],(18,19,22),None)
    s.line(top,(74,78,86))
    for row in (7,11):
        for x in range(232,1060,5):
            y=topy(x)+row; s.line([(x,y),(x+2.5,y)],(30,32,37),1)
    s.poly([(150,602),(262,590),(256,600),(156,611)],(14,15,18),None)          # rejilla del parlante (izq.)
    for x in range(160,254,4): s.px(x,int(topy(x)+12),(36,38,43))
    # cara del tablero + banda de cuero charcoal con costura + filete plata (como el T9)
    s.poly([(0,648),(330,628),(640,624),(950,628),(W,648),(W,H),(0,H)],(26,28,32))
    s.poly([(1066,642),(W,652),(W,682),(1066,670)],C['wood'],None)
    for x in range(1070,W,6): s.line([(x,647+(x-1066)*0.075),(x+3,647+(x+3-1066)*0.075)],(66,58,50),1)
    s.poly([(1066,672),(W,684),(W,689),(1066,677)],(104,108,116),None)
    s.poly([(140,654),(400,634),(400,656),(140,676)],C['wood'],None)
    s.poly([(140,678),(400,658),(400,662),(140,682)],(90,94,102),None)
    # --- difusor izquierdo con marco cromado
    s.poly([(20,616),(134,608),(136,690),(22,698)],CHROME,(70,74,82),r=6)
    s.poly([(27,622),(128,615),(129,683),(29,690)],(11,12,14),None,r=4)
    for i in range(1,9): s.line([(30,622+i*7.4),(127,615+i*7.4)],(42,44,50),1)
    s.rect(74,636,82,668,(90,94,102),OL,r=2)
    s.line([(22,617),(134,609)],(150,154,162),1)
    # --- palancas (tras el volante, no rotan)
    s.poly([(566,602),(450,590),(447,600),(566,614)],(24,25,29))
    s.rect(430,584,456,604,(32,34,38),(110,114,122),r=5); s.line([(436,594),(450,594)],(140,144,152) if luces else (70,74,82),1)
    s.poly([(714,602),(830,590),(833,600),(714,614)],(24,25,29))
    s.rect(824,584,850,604,(32,34,38),(110,114,122),r=5); s.line([(830,594),(844,594)],(140,144,152) if luces else (70,74,82),1)
    # --- cuadro digital en visera (binnacle)
    hood=[(470,524),(468,452),(500,440),(640,432),(780,440),(812,452),(810,524)]
    s.poly(hood,(15,16,19),OL,r=14); s.line([(500,441),(640,433),(780,441)],(46,48,54))
    sx0,sy0,sx1,sy1=486,450,794,522
    if luces: s.glow((sx0,sy0,sx1,sy1),COOL,rings=((9,7),(5,12),(2,20)),r=10)
    s.rect(sx0,sy0,sx1,sy1,(8,9,12) if luces else (10,11,13),(40,42,48),r=10)
    if luces:
        # gauges laterales en arco: ticks segmentados blancos + marcas rojas
        for cx,a0,a1,sg in ((562,112,248,-1),(718,-68,68,1)):
            cy=488; r=30
            s.arc(cx,cy,r,a0,a1,(182,188,198),1.6)
            for k,a in enumerate(np.linspace(a0+6,a1-6,9)):
                t=math.radians(a); lit=k>=5
                p0=(cx+math.cos(t)*(r-3),cy+math.sin(t)*(r-3)); p1=(cx+math.cos(t)*(r-9),cy+math.sin(t)*(r-9))
                s.line([p0,p1],(214,218,226) if lit else (96,102,112),2.2 if lit else 1.2)
            t=math.radians(a0+16 if sg<0 else a1-16); s.line([(cx+math.cos(t)*(r-2),cy+math.sin(t)*(r-2)),(cx+math.cos(t)*(r-8),cy+math.sin(t)*(r-8))],RED,2)
        # pantalla central: autonomía + carro
        s.rect(600,455,680,518,(13,15,20),(34,38,46),r=6)
        s.arc(640,494,22,200,340,(104,92,66),2)                                  # aro tibio apagado (no ámbar)
        s.text3(622,462,'319',(224,228,234),2)
        for x in (604,612): s.line([(x,459),(x+5,459)],(110,116,126),1)
        s.text3(668,470,'0',(200,206,214),1)
        s.poly([(632,506),(648,506),(650,512),(630,512)],(150,156,166),None,r=2)   # carro (vista trasera)
        s.rect(634,501,646,506,(110,116,126),None,r=2)
        s.px(633,509,(170,52,58),1); s.px(646,509,(170,52,58),1)
        s.line([(606,516),(626,516)],(90,96,106),1); s.line([(654,516),(674,516)],(90,96,106),1)
        s.rect(636,452,644,454,(70,120,176),None)                                # barra azul (batería/eco)
        s.px(606,452,C['glow'],2)                                                # único testigo ámbar del cuadro
    else:
        s.tpoly([(510,452),(560,452),(520,520),(486,520)],(255,255,255,7))    # reflejo en el vidrio apagado
    # --- pantalla táctil VERTICAL con bisel cromado + fila de botones físicos
    s.rect(882,522,1038,718,CHROME,(70,74,82),r=8); s.line([(883,530),(883,712)],(156,160,168),1)
    s.rect(887,526,1033,712,(8,9,11),None,r=6)
    gx0,gy0,gx1,gy1=894,532,1026,690
    if luces: s.glow((gx0,gy0,gx1,gy1),(120,132,170),rings=((10,5),(6,9),(2,14)),r=6)
    s.rect(gx0,gy0,gx1,gy1,(11,13,19) if luces else (9,10,12),(30,33,40),r=3)
    if luces:
        for x,w_ in ((900,10),(914,8),(926,14)): s.line([(x,538),(x+w_,538)],(92,98,110),1)
        s.line([(1008,538),(1020,538)],(92,98,110),1)
        s.ell(918,562,12,12,(92,60,108),(140,110,150),1)                         # disco de medios
        s.poly([(915,556),(924,562),(915,568)],(214,218,224),None)
        s.rect(908,580,924,585,(116,70,72),None,r=2)                             # píldora de radio
        tiles=[(898,(124,74,80)),(941,(74,72,134)),(984,(70,112,68))]
        for i,(tx,col) in enumerate(tiles):
            s.rect(tx,596,tx+39,646,col,None,r=3)
            s.line([(tx+4,600),(tx+18,600)],(196,198,204),1)
            if i==0:
                s.ell(tx+20,624,10,10,(58,94,146),None); s.poly([(tx+20,616),(tx+26,630),(tx+20,627),(tx+14,630)],(226,230,236),None)
            elif i==1:
                s.rect(tx+10,614,tx+30,634,(30,58,40),None,r=4); s.ell(tx+20,624,6,6,None,(120,190,130),1); s.poly([(tx+18,621),(tx+23,624),(tx+18,627)],(170,220,175),None)
            else:
                s.line([(tx+13,617),(tx+15,628),(tx+26,631)],(226,230,236),3); s.ell(tx+13,617,2,2,(226,230,236)); s.ell(tx+26,631,2,2,(226,230,236))
        s.line([(898,654),(1022,654)],(34,38,46),1)
        s.text3(902,664,'5',(170,176,186),1); s.line([(910,666),(916,666)],(120,126,136),1)
        s.px(926,665,C['glow'],2); s.px(946,665,C['glow'],2)                    # iconos tibios del clima (ámbar mínimo)
        s.text3(962,664,'AUTO',(170,176,186),1); s.text3(1010,664,'18',(200,206,214),1)
    else:
        s.tpoly([(900,534),(950,534),(910,688),(894,688)],(255,255,255,8))
    # botones físicos plata bajo la pantalla, con el de emergencia (triángulo rojo)
    for i in range(6):
        bx=892+i*23; s.rect(bx,694,bx+20,708,(86,90,98),(46,48,54),r=2)
        if i==3:
            s.poly([(bx+10,697),(bx+15,705),(bx+5,705)],None,RED if luces else RED_OFF,1.4)
        elif luces: s.line([(bx+7,701),(bx+13,701)],(190,196,204),1)
    s.rect(882,712,1038,716,(132,136,144),None)
    # --- difusor vertical alto junto a la pantalla (marco cromado)
    s.rect(1042,540,1068,700,CHROME,(70,74,82),r=6); s.rect(1047,546,1063,694,(11,12,14),None,r=3)
    for x in (1051,1055,1059): s.line([(x,548),(x,692)],(40,42,48),1)
    s.rect(1050,604,1060,616,(96,100,108),OL,r=2); s.line([(1043,546),(1043,694)],(150,154,162),1)
    # --- retrovisor: ventana trasera con barra del platón + cabeceras claras (asientos beige)
    s.rect(872,48,884,70,(30,32,36),None)
    s.poly([(800,68),(960,64),(964,116),(804,120)],(30,32,36),(90,94,102))
    s.poly([(810,74),(952,70),(955,110),(813,114)],(13,14,17),None)
    d.polygon(s.S([(822,108),(840,80),(924,78),(944,104)]),fill=(24,26,31))
    s.line([(828,106),(846,84),(918,82),(938,104)],(78,82,90),2)
    s.line([(846,84),(852,104)],(78,82,90)); s.line([(918,82),(912,104)],(78,82,90))
    for x0 in (842,904): s.poly([(x0,97),(x0+20,95),(x0+20,111),(x0,112)],BEIGE2,None,r=4)
    s.poly([(928,88),(955,86),(955,110),(926,112)],BEIGE,None,r=5)               # cabecera del copiloto (borde del espejo)
    s.line([(930,99),(952,98)],(70,66,58),1)
    return im

def volante():
    """volante suelto @×K: aro negro grueso, U plateada, rayos plata con botoneras, cubo con insignia oval cromada JAC"""
    w,h=WCAN; im=Image.new('RGBA',(w*K,h*K),(0,0,0,0)); cx,cy=WHUB
    s=Scr(im,cx,cy)   # coordenadas locales: (0,0) = centro del cubo
    def disk_mask(r,flat):
        m=Image.new('L',im.size,0); g=ImageDraw.Draw(m)
        g.ellipse([(cx-r)*K,(cy-r)*K,(cx+r)*K,(cy+r)*K],fill=255)
        g.rectangle([0,(cy+flat)*K,w*K,h*K],fill=0); return m
    def band(y0):
        m=Image.new('L',im.size,0); ImageDraw.Draw(m).rectangle([0,(cy+y0)*K,w*K,h*K],fill=255); return m
    from PIL import ImageChops
    outer=disk_mask(WR,WFLAT); inner=disk_mask(WR-WT,WFLAT-WT); rim=ImageChops.subtract(outer,inner)
    im.paste(Image.new('RGBA',im.size,LEATHER+(255,)),(0,0),rim)
    # inserto plateado en la mitad inferior del aro (cara interior) — parte de la "U"
    sil=ImageChops.multiply(ImageChops.multiply(rim,disk_mask(WR-WT+15,WFLAT-WT+15)),band(24))
    im.paste(Image.new('RGBA',im.size,SIL+(255,)),(0,0),sil)
    def clip(layer,mask):
        a=np.asarray(layer).copy(); a[...,3]=(a[...,3].astype(int)*np.asarray(mask).astype(int)//255).astype(np.uint8)
        im.alpha_composite(Image.fromarray(a,'RGBA'))
    above=ImageChops.subtract(rim,band(WFLAT-WT))          # aro sin la franja plana
    d1=Image.new('RGBA',im.size,(0,0,0,0)); g=Scr(d1,cx,cy)
    g.arc(0,0,WR-WT+15,24,156,SIL_HI,1.2); g.arc(0,0,WR-WT+1,20,160,OL,1)
    clip(d1,above)
    d2=Image.new('RGBA',im.size,(0,0,0,0)); g=Scr(d2,cx,cy)
    g.line([(-200,WFLAT-WT+15),(200,WFLAT-WT+15)],SIL_HI,1)
    g.line([(-200,WFLAT-WT+1),(200,WFLAT-WT+1)],OL,1)
    g.arc(0,0,WR-1,0,360,(44,46,52),1); g.line([(-200,WFLAT-1),(200,WFLAT-1)],(44,46,52),1)
    g.arc(0,0,WR-WT,180,360,(40,42,47),1)
    g.arc(0,0,WR-5,206,334,(62,65,72),2)
    g.rect(-5,-WR+1,5,-WR+WT-1,(150,154,162),None)
    clip(d2,rim); s.d=ImageDraw.Draw(im,'RGBA')
    # rayos plateados con botoneras
    for sg in (-1,1):
        P=lambda pts: [(sg*x,y) for x,y in pts]
        s.poly(P([(-207,-6),(-94,-18),(-82,48),(-205,42)]),(112,116,124),OL)
        s.line(P([(-205,-5),(-95,-17)]),(164,168,176),1)
        s.poly(P([(-188,4),(-110,-2),(-104,32),(-186,34)]),(30,32,36),(96,100,108),1,r=6)
        for bx0,bx1 in ((-176,-152),(-142,-118)):
            s.poly(P([(bx0,9),(bx1,8),(bx1,24),(bx0,25)]),(138,142,150),(64,67,74),1,r=4)
            s.line(P([(bx0+5,17),(bx1-5,16)]),(70,74,82),1)
    # U plateada bajo el cubo (de rayo a rayo)
    def bez(p0,p1,p2,n=18): return [((1-t)**2*p0[0]+2*(1-t)*t*p1[0]+t*t*p2[0],(1-t)**2*p0[1]+2*(1-t)*t*p1[1]+t*t*p2[1]) for t in np.linspace(0,1,n)]
    U=bez((-100,36),(-84,126),(0,126))+bez((0,126),(84,126),(100,36))[1:]
    s.line(U,(40,42,47),13); s.line(U,SIL,9); s.line([(x,y-3) for x,y in U[3:-3]],SIL_HI,1.5)
    # cubo (airbag): trapecio redondeado, más ancho arriba
    hub=[(-98,-92),(98,-92),(76,72),(-76,72)]
    s.poly(hub,(23,24,28),(66,69,76),1.2,r=26)
    s.poly([(-90,-86),(90,-86),(84,-40),(-84,-40)],(30,32,37),None,r=20)
    s.poly([(-84,-62),(84,-62),(80,-40),(-80,-40)],(27,28,33),None,r=6)
    # insignia oval cromada JAC
    s.ell(0,-14,32,13.5,(166,170,178),(96,100,108),1); s.ell(0,-14,28.5,10.5,(10,11,13))
    px=2; x0=-(3*5*px+2*3)//2; y0=-14-7
    for i,ch in enumerate('JAC'):
        for rr,row in enumerate(B.FONT[ch]):
            for cc,bit in enumerate(row):
                if bit=='1': s.px(x0+i*(5*px+3)+cc*px,y0+rr*px,(190,194,202),px)
    s.line([(-20,-6),(20,-6)],(60,63,70),1)
    return im
