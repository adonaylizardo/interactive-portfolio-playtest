import json,sys,glob,math
def wrap(d):
  while d>2: d-=4
  while d<-2: d+=4
  return d
for f in sorted(glob.glob('logs/turnprobe-*.json')):
  R=json.load(open(f)); F=[r for r in R.get('frames',[]) if r[1] not in ('boot',) and r[8]==1]
  snaps=[];swaps=[];stops=[];maxd=0;fb=0;crab=0;ghost=0
  st=None
  for a,c in zip(F,F[1:]):
    d=math.hypot(c[2]-a[2],c[3]-a[3]); maxd=max(maxd,d); fb+=c[25] or 0
    steer=(c[22] if c[22] is not None else 0) or (c[19] or 0)
    dh=wrap(c[4]-a[4])
    if abs(dh)>0.3: snaps.append((c[1],round(dh,2),a[5],c[5],round(a[6],1),round(c[6],1),'steer' if abs(steer)>0.1 else 'NOSTEER',(round(c[2],2),round(c[3],2))))
    if a[5]!=c[5]: swaps.append((round(dh,2),round(a[6],1),round(c[6],1)))
    if d>0.05:
      V={'se':(1,0),'nw':(-1,0),'sw':(0,1),'ne':(0,-1)}[c[5]]; al=abs(((c[2]-a[2])*V[0]+(c[3]-a[3])*V[1]))/d
      if al<0.82: crab+=1
    gas=(c[21] or 0)<0 or ((c[20] or 0)<-0.3)
    if gas and abs(c[6])<0.05: st=st or c[0]
    else:
      if st and c[0]-st>800: stops.append((c[1],c[0]-st,(round(c[2],2),round(c[3],2),c[5])))
      st=None
  if st and F and F[-1][0]-st>800: stops.append((F[-1][1],F[-1][0]-st,(round(F[-1][2],2),round(F[-1][3],2),F[-1][5])))
  segs=[(s['name'],s.get('out'),s.get('err')) for s in R['segs'] if not s['name'].endswith('getin')]
  print('==',f,'frames',len(F),'ce',len(R['ce']),'fb',fb,'maxFrameDisp',round(maxd,3),'crabFrames(>35deg off sprite)',crab)
  print('  segs',json.dumps(segs)[:700])
  print('  1-frame heading jumps>0.3q:',len(snaps),snaps[:8])
  print('  sprite swaps (dh, vel before, after):',swaps[:10])
  print('  gas-held stops >0.8s:',stops[:8])
