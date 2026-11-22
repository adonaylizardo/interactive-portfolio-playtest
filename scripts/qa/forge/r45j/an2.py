# r45h extra metrics, vel-independent
import json,sys,math
R=json.load(open(sys.argv[1])); C=R['cols']; F=[dict(zip(C,f)) for f in R['frames']]
DA={'se':0,'sw':90,'nw':180,'ne':270}
def ad(a,b):
    d=(a-b)%360; return 360-d if d>180 else d
vp=R['vp']
def gas(f): return f['keyY']==-1 if vp=='1440' else (f['joyActive']==1 and (f['joyY'] or 0)<-0.3)
def steer(f): return (f['keyX']!=0) if vp=='1440' else abs(f['joyX'] or 0)>0.3
crab=[];ghost=[]
for k in range(1,len(F)):
    a,b=F[k-1],F[k]
    if not(a['driving'] and b['driving']): continue
    d=math.hypot(b['cx']-a['cx'],b['cy']-a['cy'])
    if d>=0.05:
        mv=math.degrees(math.atan2(b['cy']-a['cy'],b['cx']-a['cx'])); x=ad(mv,DA[b['dir']]); x=min(x,180-x)
        if x>35: crab.append((round(x),b['seg'],round(d,2),[b['cx'],b['cy']],b['dir'],b['vel']))
        if abs(b['vel'])<0.05 and abs(a['vel'])<0.05: ghost.append((b['seg'],round(d,2),[b['cx'],b['cy']]))
# pinned: frames where gas+steer held and the trailing 3 s window has net disp <1.0 tile and heading change <0.33 qturn; merged into stretches
flag=[False]*len(F); a=0
for bb in range(len(F)):
    while F[bb]['t']-F[a]['t']>3000: a+=1
    seg=F[a:bb+1]
    if F[bb]['t']-F[a]['t']>=2900 and all(f['driving'] and gas(f) and steer(f) for f in seg):
        net=max(math.hypot(f['cx']-F[a]['cx'],f['cy']-F[a]['cy']) for f in seg); hd=max(abs(f['heading']-F[a]['heading']) for f in seg)
        if net<1.0 and hd<0.33: flag[bb]=True
pins=[];k=0
while k<len(F):
    if not flag[k]: k+=1; continue
    j=k
    while j+1<len(F) and flag[j+1]: j+=1
    pins.append((F[k]['seg'],F[j]['seg'],[round(F[k]['cx'],2),round(F[k]['cy'],2),F[k]['dir'],round(F[k]['heading'],2)],round((F[j]['t']-F[k]['t'])/1000+3,1)))
    k=j+1
segs={}
for f in F:
    if f['driving']: segs.setdefault(f['seg'],[]).append(f)
stuck=[]
for n,fs in segs.items():
    dur=(fs[-1]['t']-fs[0]['t'])/1000
    if dur<3: continue
    xs=[f['cx'] for f in fs]; ys=[f['cy'] for f in fs]; hs=[f['heading'] for f in fs]
    diag=math.hypot(max(xs)-min(xs),max(ys)-min(ys)); hr=max(hs)-min(hs)
    gf=sum(gas(f) for f in fs)/len(fs); sf=sum(gas(f) and steer(f) for f in fs)/len(fs)
    if diag<1.5 and gf>0.5: stuck.append((n,round(dur,1),[round(min(xs),2),round(min(ys),2),round(max(xs),2),round(max(ys),2)],'diag',round(diag,2),'headingRange',round(hr,2),'gas%',round(gf*100),'gas+steer%',round(sf*100),'dirs',sorted(set(f['dir'] for f in fs))))
print(json.dumps({'vp':vp,'crabAnyFrames':len(crab),'crabSample':crab[:8],'ghostMoveFrames':len(ghost),'ghostSample':ghost[:6],'pinnedSteerGasWindows':len(pins),'stuckSegs':stuck},default=str))
