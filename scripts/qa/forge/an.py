import json,sys,math
R=json.load(open(sys.argv[1])); C=R['cols']; F=[dict(zip(C,f)) for f in R['frames']]
DA={'se':0,'sw':90,'nw':180,'ne':270}
def ad(a,b):
    d=(a-b)%360; return 360-d if d>180 else d
out={'vp':R['vp'],'frames':len(F),'ce':R['ce']}
if len(F)>1: out['fps']=round((len(F)-1)*1000/(F[-1]['t']-F[0]['t']),1)
lur=[];crab=[];rest=[];needle=0;nwhere=None;gid=set();bumps=0;bgs=set();toasts=set();autoR=[];maxd=(0,None)
for k in range(1,len(F)):
    a,b=F[k-1],F[k]; dt=max(1,b['t']-a['t'])
    if a['driving'] and b['driving']:
        d=math.hypot(b['cx']-a['cx'],b['cy']-a['cy'])
        exp=max(abs(a['vel']),abs(b['vel']))*dt/1000
        if d>maxd[0]: maxd=(round(d,3),b['seg'],dt,[a['cx'],a['cy']],[b['cx'],b['cy']],a['vel'],b['vel'])
        if d>0.3 and d>exp*1.6+0.08: lur.append((round(d,2),b['seg'],dt,[a['cx'],a['cy'],a['dir']],[b['cx'],b['cy'],b['dir']],round(exp,2)))
        if d>=0.02 and abs(b['vel'])>0.3:
            mv=math.degrees(math.atan2(b['cy']-a['cy'],b['cx']-a['cx'])); face=DA[b['dir']]+(180 if b['vel']<0 else 0)
            x=ad(mv,face)
            if x>35: crab.append((round(x),b['seg'],[b['cx'],b['cy']],b['dir']))
        if abs(b['vel'])<0.05:
            h=ad(b['heading']*90,DA[b['dir']])
            if h>40: rest.append((round(h),b['seg']))
        for n in ('rpmDeg','mphDeg'):
            if a[n] is not None and b[n] is not None:
                j=ad(b[n],a[n])*min(1,16.7/dt)
                if j>needle: needle=j; nwhere=(n,a[n],b[n],dt,b['seg'])
        if a['gear']=='D' and b['gear']=='R' and 'R' not in b['seg']: autoR.append((b['seg'],b['t']))
    if b['gearElId'] is not None and b['driving']: gid.add(b['gearElId'])
    if b['bump'] and not a['bump']: bumps+=1
    if b['dockBg']: bgs.add(b['dockBg'])
    if b['toast']: toasts.add(b['toast'])
out.update(maxPerFrame=maxd,lurches=len(lur),lurchList=lur[:12],crabFrames=len(crab),crabWorst=max(crab,default=None),restOffsetFrames=len(rest),restOffsetSegs=sorted(set(s for _,s in rest)),restWorst=max([h for h,_ in rest],default=0),
  needleMaxPer60fps=round(needle,1),needleWhere=nwhere,gearElIds=sorted(gid),bumps=bumps,dockBgs=sorted(bgs),toasts=sorted(toasts),autoR=autoR)
# deadlocks: gas held >=1.5s, zero travel
def gas(f):
    if R['vp']=='1440': return f['keyY']==-1
    return f['joyActive']==1 and (f['joyY'] or 0)<-0.3
dl=[];i=0
while i<len(F):
    if not(gas(F[i]) and F[i]['driving'] and F[i]['gear'] in('D','R')): i+=1; continue
    j=i
    while j+1<len(F) and gas(F[j+1]): j+=1
    a=i
    for bb in range(i,j+1):
        while F[bb]['t']-F[a]['t']>1500: a+=1
        if F[bb]['t']-F[a]['t']>=1460 and math.hypot(F[bb]['cx']-F[a]['cx'],F[bb]['cy']-F[a]['cy'])<0.02:
            steer = (F[bb]['keyX']!=0) if R['vp']=='1440' else abs(F[bb]['joyX'] or 0)>0.3
            dl.append((F[bb]['seg'],[F[bb]['cx'],F[bb]['cy'],F[bb]['dir'],round(F[bb]['heading'],2)],'steer' if steer else 'straight')); break
    i=j+1
out['deadlocks']=dl
fbf=[f for f in F if f.get('fb') and f['driving']]
out['fbFrames']=len(fbf); out['fbSegs']=sorted(set(f['seg'] for f in fbf)); out['fbSample']=[(f['seg'],f['cx'],f['cy'],f['dir'],f['vel']) for f in fbf[::max(1,len(fbf)//8)]][:10]
# spins: sprite change with <0.3 travel since last change
sp=[];last=None;trav=0
for k in range(1,len(F)):
    a,b=F[k-1],F[k]
    if not(a['driving'] and b['driving']): continue
    trav+=math.hypot(b['cx']-a['cx'],b['cy']-a['cy'])
    if b['dir']!=a['dir']:
        if last is not None and trav<0.3: sp.append((b['seg'],a['dir'],b['dir'],round(trav,2),[b['cx'],b['cy']]))
        last=k; trav=0
out['spins']=sp
print(json.dumps(out,indent=1,default=str))
print('\nSEGMENTS'); [print(f"{s['name'][:34]:34} end {s['end']} {s.get('err') or ''} {json.dumps(s.get('out'))[:220] if s.get('out') else ''}") for s in R['segs']]
