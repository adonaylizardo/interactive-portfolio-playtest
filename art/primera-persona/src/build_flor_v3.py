# Re-exporta SOLO la Flor v3b (plana) y la variante con profundidad. No toca la Catedral (aprobada) ni ninguna otra pieza.
# El frame A no incluye la Flor (escena2: Teresa, Catedral, Biblioteca), así que no se re-renderiza.
import json, os, sys, math
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from PIL import Image
import build_primera_persona as B, v2_piezas as P, build_v2 as BV, v3b_flor as F
from build_catedral_flor import halo   # solo la función (el módulo está protegido abajo)
OUT=B.OUT; PZ=f'{OUT}/piezas'; K=B.K
rep={}; qa={}
for key in ('flor-de-venezuela','flor-de-venezuela-profundidad'):
    for luz in (True,False):
        im,w,h,an=BV.render_fachada(key,luz); nm=f"fachada-{key}__luz-{'encendida' if luz else 'apagada'}"
        assert (w,h,an)==(679,329,[339,328]),(w,h,an)
        i1=BV.export(im,f'{PZ}/{nm}',w,h); a=np.asarray(i1).astype(int)
        r,g,b,al=[a[...,i] for i in range(4)]; amb=(al>20)&(r>90)&(r-b>55)&(g>b)&(r>=g)
        tot=round(100*B.amber_share(i1),2); n,hp=halo(i1,im)
        rep[nm]=dict(w=w,h=h,ancla=an,ambar_pct=tot)
        qa[nm]=dict(ambar_pct=tot,ambar_pct_lienzo_total=round(100*amb.sum()/(w*h),2),borde_px=n,halo_pct=hp,filas_sup_con_alfa=int((al[0]>0).sum()))
        print(nm,w,h,an,'ámbar',tot,'/',qa[nm]['ambar_pct_lienzo_total'],'· halo',hp,'de',n,'· fila 0 con alfa',qa[nm]['filas_sup_con_alfa'])
# propuesta de lienzo alto (NO es pieza): corona sin comprimir (VK=1, capitel 13,8 m como en la foto nocturna)
F.HUB,F.VK=13.8,1.0
f=dict(P.FACH2['flor-de-venezuela'],fn=F.flor_profundidad,v1=23.0)
BV.FACH_ALL['_alto']=f
im,w,h,an=BV.render_fachada('_alto',True); i1=BV.down(im,w,h); al=np.asarray(i1)[...,3]
top=int(np.argmax(al.max(1)>0)); print('propuesta alta:',w,h,an,'primera fila con alfa',top,'→ alto necesario',h-top,'px =',round((h-1-top)/16,2),'m')
need_v1=math.ceil((h-1-top)/16*10+2)/10                                         # +0,2 m de margen
f['v1']=need_v1; im,w,h,an=BV.render_fachada('_alto',True); i1=BV.down(im,w,h)
os.makedirs('/workspace/portfolio/qa/primera-persona',exist_ok=True)
i1.save('/workspace/portfolio/qa/primera-persona/flor-v3-propuesta-lienzo-alto@1x.png')
F.HUB,F.VK=12.9,0.80
prop=dict(v1_m=need_v1,tamano_1x=[w,h],ancla=an,hub_m=13.8,vk=1.0,archivo='/workspace/portfolio/qa/primera-persona/flor-v3-propuesta-lienzo-alto@1x.png')
print('propuesta',prop)
p=f'{OUT}/src/ambar-v2.json'; R=json.load(open(p)); R['piezas'].update(rep); json.dump(R,open(p,'w'),indent=1,ensure_ascii=False)
p=f'{OUT}/src/qa-v2.json'; Q=json.load(open(p)); Q.update(qa); json.dump(Q,open(p,'w'),indent=1,ensure_ascii=False)
json.dump(dict(piezas=rep,qa=qa,propuesta=prop),open('/tmp/flor3-rep.json','w'),indent=1,ensure_ascii=False)
