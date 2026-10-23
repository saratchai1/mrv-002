from inspect_workbook import load_workbook, SRC, OUT
import json,collections,re,math,hashlib,statistics

sheets=load_workbook();wb={s['name']:s for s in sheets}
def cell(s,c,r):return s['cells'].get(f'{c}{r}',{})
def val(s,c,r):return cell(s,c,r).get('v')
def num(x):return isinstance(x,(int,float)) and not isinstance(x,bool)
def text(x):return None if x is None else str(x).strip()
def write(name,obj):
    tmp=OUT/(name+'.tmp');tmp.write_text(json.dumps(obj,ensure_ascii=False,separators=(',',':')));tmp.replace(OUT/name)

species=[];mwd=wb['MWD']
for r in range(2,33):
    species.append({'name':val(mwd,'B',r),'scientificName':val(mwd,'C',r),'woodDensity':val(mwd,'D',r),'reference':val(mwd,'E',r),'sourceRow':r,'densityIsProxy':'ไม่มีข้อมูล' in str(val(mwd,'E',r))})
lookup={x['name']:x for x in species}
summary=wb['สรุปข้อมูลแปลงตัวอย่าง'];plotMeta={};coast=None;province=None;stratum=None
for r in range(2,130):
    coast=val(summary,'A',r) or coast;province=val(summary,'C',r) or province;stratum=val(summary,'B',r) or stratum
    if not val(summary,'D',r): continue
    alias=val(summary,'D',r)
    # Source formula establishes the link even when display code is a typo.
    link=cell(summary,'N',r).get('f','')
    sheetId=re.search(r'([A-Z]+\d+)!',link).group(1)
    plotMeta[sheetId]={'id':sheetId,'name':sheetId,'summaryPlotAlias':alias,'province':province,'coast':coast,'stratum':stratum,'areaRai':val(summary,'E',r),'summaryRow':r,'sourceTreesPerRai':val(summary,'I',r),'sourceBiomassPerRai':val(summary,'J',r),'stockPerRai':val(summary,'N',r),'corners':[{'marker':val(summary,'F',k),'easting':val(summary,'G',k),'northing':val(summary,'H',k),'sourceRow':k} for k in range(r,r+4)],'crs':None}

records=[];plots=[];formulas={};issues=[];flagCounts=collections.Counter();sourceErrors=[];noteNumeric=[];recalcFailures=[];countText=[]
for s in sheets:
    for ref,c in s['cells'].items():
        if c.get('t')=='e':sourceErrors.append({'sheet':s['name'],'cell':ref,'error':c['v']})
for s in sheets[8:]:
    rows=[r for r in range(2,1000) if isinstance(val(s,'D',r),str) and val(s,'E',r) is not None and isinstance(val(s,'B',r),str)]
    tags=collections.Counter(text(val(s,'C',r)) for r in rows)
    p=dict(plotMeta[s['name']]);local=[]
    for r in rows:
        d=val(s,'E',r);name=val(s,'D',r);sd=lookup.get(name);density=sd['woodDensity'] if sd else None
        cf=val(s,'L',r);molar=val(s,'M',r);cached=val(s,'N',r)
        expectedAgb=0.251*density*d**2.46 if num(d) and d>0 and density else None
        expectedBgb=0.199*density**0.899*d**2.22 if num(d) and d>0 and density else None
        expected=(expectedAgb+expectedBgb)/1000*cf*molar if expectedAgb is not None and num(cf) and num(molar) else None
        diff=expected-cached if num(expected) and num(cached) else None
        note=val(s,'F',r);tag=text(val(s,'C',r));marker=val(s,'G',r);flags=[]
        if val(s,'A',r) is None:flags.append('SEQUENCE_MISSING')
        if not tag:flags.append('MISSING_TAG')
        elif tags[tag]>1:flags.append('DUPLICATE_TAG_IN_PLOT')
        if marker is None: flags.append('COUNT_MARKER_BLANK')
        elif not num(marker):
            flags.append('COUNT_MARKER_TEXT');countText.append({'sheet':s['name'],'row':r,'value':marker})
        if isinstance(note,str) and re.search(r'นาง|แตก',note):flags.append('STEM_OR_BRANCH_NOTE')
        if num(note):
            flags.append('NUMERIC_NOTE')
            if abs(note-d/math.pi)<1e-7:flags.append('DIAMETER_CIRCUMFERENCE_AMBIGUITY')
            noteNumeric.append({'sheet':s['name'],'row':r,'dbh':d,'note':note,'noteEqualsDbhDivPi':abs(note-d/math.pi)<1e-7})
        if sd and sd['densityIsProxy']:flags.append('WOOD_DENSITY_PROXY')
        if expected is None:flags.append('CALCULATION_INPUT_MISSING')
        elif abs(diff)>1e-9:
            flags.append('SOURCE_CALCULATION_MISMATCH');recalcFailures.append({'sheet':s['name'],'row':r,'cached':cached,'recalculated':expected,'difference':diff})
        record={'id':s['name']+'-r'+str(r),'plotId':s['name'],'row':r,'sequence':val(s,'A',r),'sourcePlotCode':val(s,'B',r),'tag':tag,'species':name,'dbhCm':d,'note':note,'countMarker':marker,'woodDensity':density,'agbKg':val(s,'H',r),'bgbKg':val(s,'I',r),'carbonFraction':cf,'stockTco2e':cached,'recalculatedStockTco2e':expected,'calculationDifference':diff,'flags':flags}
        records.append(record);local.append(record);flagCounts.update(flags)
    end=max(rows)+1
    sourceCount=val(s,'G',end);sourceStock=val(s,'N',end)
    p.update({'sourcePlotCode':collections.Counter(x['sourcePlotCode'] for x in local).most_common(1)[0][0],'recordCount':len(local),'sourceTreeCount':sourceCount,'uniqueTagCount':sum(bool(t) for t in tags),'sourceStockTco2e':sourceStock,'recalculatedStockTco2e':sum(x['recalculatedStockTco2e'] or 0 for x in local),'meanDbhCm':statistics.mean(x['dbhCm'] for x in local),'minDbhCm':min(x['dbhCm'] for x in local),'maxDbhCm':max(x['dbhCm'] for x in local),'speciesCount':len(set(x['species'] for x in local)),'sourceTotalRow':end,'flags':[],'qaRecordCount':sum(bool(x['flags']) for x in local)})
    if p['summaryPlotAlias']!=s['name']:p['flags'].append('SUMMARY_PLOT_ALIAS_MISMATCH')
    if num(sourceCount) and sourceCount!=len(local):p['flags'].append('COUNT_DIFFERS_FROM_RECORDS')
    if any(x['flags'] and 'DIAMETER_CIRCUMFERENCE_AMBIGUITY' in x['flags'] for x in local):p['flags'].append('DIAMETER_CIRCUMFERENCE_AMBIGUITY')
    if not math.isclose(sum(x['stockTco2e'] for x in local),sourceStock,abs_tol=1e-9):p['flags'].append('SOURCE_TOTAL_MISMATCH')
    if not math.isclose(sourceStock/p['areaRai'],p['stockPerRai'],abs_tol=1e-9):p['flags'].append('AREA_NORMALIZATION_MISMATCH')
    if not math.isclose(sum(x['recalculatedStockTco2e'] for x in local),sourceStock,abs_tol=1e-8):p['flags'].append('RECALCULATED_TOTAL_MISMATCH')
    plots.append(p)
    formulas[s['name']]={ref:c['f'] for ref,c in s['cells'].items() if c.get('f')}

projectPlots=[];s=wb['แปลง MOC2 VSD']
for r in range(2,24):
    projectPlots.append({'id':val(s,'B',r),'sourceRow':r,'province':val(s,'G',r),'district':val(s,'F',r),'subdistrict':val(s,'E',r),'village':val(s,'D',r),'villageNumber':val(s,'C',r),'condition':val(s,'H',r),'approvedAreaRai':val(s,'I',r),'waterAreaRai':val(s,'J',r),'participatingAreaRai':val(s,'K',r)})
strata=[];s=wb['CTT0'];coast=None
for r in range(4,10):
    coast=val(s,'C',r) or coast
    strata.append({'id':'stratum-'+str(r-3),'coast':coast,'stratum':text(val(s,'D',r)),'stockPerRai':val(s,'E',r),'areaRai':val(s,'F',r),'stockTco2e':val(s,'G',r),'sourceRow':r,'densitySourceFormula':cell(s,'E',r).get('f'),'areaSourceFormula':cell(s,'F',r).get('f')})
projection=[];s=wb['Total GHG']
for r in range(2,13):
    projection.append({'yearBE':val(s,'A',r),'baselineTco2e':val(s,'B',r),'projectStockTco2e':val(s,'C',r),'leakageTco2e':val(s,'D',r),'sourceCumulativeReductionTco2e':val(s,'E',r),'kind':'projection' if r>2 else 'reference_year','sourceRow':r})

issues=[
 {'code':'BASELINE_DATE_MISSING','severity':'warning','scope':'dataset','message':'ไม่พบวันที่ลงวัดจริง ปี 2567 มาจาก Total GHG!A2 เป็นปีอ้างอิงของแบบจำลอง ไม่ใช่วันที่วัดรายต้น'},
 {'code':'TREE_IDENTITY_UNCONFIRMED','severity':'warning','scope':'dataset','message':'แถวข้อมูล หมายเลขป้าย และจำนวนต้นในคอลัมน์ G ไม่เท่ากัน ต้องยืนยันต้น/ลำต้นก่อนจับคู่รอบสำรวจ'},
 {'code':'CRS_UNSPECIFIED','severity':'warning','scope':'dataset','message':'มีพิกัด E/N ของหมุดแปลง แต่ไม่พบระบบพิกัดหรือ datum ห้ามแปลงเป็นละติจูดลองจิจูดโดยเดา'},
 {'code':'SUMMARY_PLOT_ALIAS_MISMATCH','severity':'warning','scope':'PNGM1','message':'สรุปข้อมูลแปลงตัวอย่าง!D114 และ FCD!E29 เขียน PNHM1 แต่สูตรและหมุดอ้างอิง PNGM1 เก็บรหัสต้นฉบับเป็น alias'},
 {'code':'DIAMETER_CIRCUMFERENCE_AMBIGUITY','severity':'warning','scope':'TRUL2','message':'TRUL2 มีค่าตัวเลขในหมายเหตุ F ซึ่งเท่ากับค่า E/π ใน 72 แถว แม้ E ระบุหัวข้อ DBH ต้องยืนยันว่าค่าที่ใช้คำนวณเป็น DBH หรือเส้นรอบวง'},
 {'code':'COUNT_MARKER_TEXT','severity':'warning','scope':'CMPH7!G505','message':'CMPH7!G505 เป็นข้อความ "1" Excel SUM ไม่รวม จึงต้องเก็บชนิดข้อมูลและจำนวนจากต้นฉบับไว้'},
 {'code':'SEQUENCE_MISSING','severity':'info','scope':'STUH2!A177','message':'STUH2 แถว 177 ไม่มีลำดับใน A177 แต่มีข้อมูลต้นไม้ครบและคาร์บอน 0.6138655803479369 ตัน CO₂e จึงต้องนำเข้าด้วย'},
 {'code':'MISSING_TAG','severity':'warning','scope':'CMPH4!C330','message':'CMPH4 แถว 330 มีชนิดไม้และขนาด แต่ไม่มีหมายเลขป้าย ต้องระบุต้นจริงก่อนจับคู่การวัดซ้ำ'},
 {'code':'SUMMARY_TRAILING_ARGUMENT','severity':'warning','scope':'สรุปข้อมูลแปลงตัวอย่าง!L46','message':'สูตร AVERAGE(K46,K50,K54,) มีอาร์กิวเมนต์ว่างท้ายสูตร ค่าเก็บ 79.70 ต่างจากค่าเฉลี่ยสามแปลง 106.26318579916314; คาร์บอน O46 ใช้สูตรแยก ไม่มีอาร์กิวเมนต์ว่างท้าย'},
 {'code':'PROJECTION_NOT_MEASUREMENT','severity':'info','scope':'CTTt / Total GHG','message':'ปี 2568–2577 เป็นค่าคาดการณ์โดยใช้ MAI 9.4 ตัน CO₂/ไร่/ปี ไม่ใช่การตรวจวัดซ้ำหรือเครดิตรับรอง'},
 {'code':'FCD_LOW_INCLUDES_BARE','severity':'warning','scope':'CTT0!F6,F9','message':'พื้นที่ชั้นภูมิน้อยรวมพื้นที่ Bare/FCD-Process Error ตามสูตรต้นฉบับ ต้องให้ผู้รับผิดชอบยืนยันการจัดชั้นก่อนขยายผลโครงการ'},
 {'code':'HEIGHT_POM_DATE_ABSENT','severity':'info','scope':'dataset','message':'ไม่มีคอลัมน์ความสูงต้นไม้ ความสูง/ตำแหน่งจุดวัด วันที่วัด ผู้สำรวจ รูป หรือ GPS รายต้นในตารางต้นไม้ ต้องเก็บเพิ่มในรอบใหม่'},
]

meta={'fileName':SRC.name,'sha256':hashlib.sha256(SRC.read_bytes()).hexdigest(),'fileCitationId':'file_00000000c40c82119503ca7323ce0147','baselineYearBE':2567,'baselineYearEvidence':'Total GHG!A2','measurementDate':None,'sheetCount':len(sheets),'samplePlotCount':len(plots),'measurementCount':len(records),'sourceTreeCount':sum(p['sourceTreeCount'] for p in plots),'distinctPlotTagCount':sum(p['uniqueTagCount'] for p in plots),'sampleAreaRai':sum(p['areaRai'] for p in plots),'sampleStockTco2e':sum(p['sourceStockTco2e'] for p in plots),'projectPlotCount':len(projectPlots),'provinceCount':len(set(p['province'] for p in plots)),'projectAreaRai':val(wb['CTT0'],'F',10),'projectBaselineTco2e':val(wb['CTT0'],'G',10),'projectionMaiTco2eRaiYear':val(wb['CTTt'],'D',7),'carbonFraction':0.4715,'molarRatio':44/12,'methodId':'source-workbook-moc2-komiyama-density-v1','sourceReconciliationToleranceTco2e':1e-8,'sourceCellMap':{'sequence':'A','plotCode':'B','tag':'C','species':'D','dbhCm':'E','note':'F','countMarker':'G','agbKg':'H','bgbKg':'I','biomassKg':'J','biomassTonnes':'K','carbonFraction':'L','molarRatio':'M','stockTco2e':'N'},'flags':['BASELINE_DATE_MISSING','TREE_IDENTITY_UNCONFIRMED','CRS_UNSPECIFIED','PROJECTION_NOT_MEASUREMENT']}

meta['measuredSpeciesCount']=len(set(x['species'] for x in records))
meta['woodDensityReferenceSpeciesCount']=len(species)
meta['missingTagRecordCount']=sum(not x['tag'] for x in records)
meta['distinctPlotTagCountDefinition']='Unique nonblank tag values within each source plot; not confirmed physical-tree count.'
result={'schemaVersion':1,'meta':meta,'plots':plots,'records':records,'species':species,'projectPlots':projectPlots,'strata':strata,'projection':projection,'qa':{'issues':issues,'counts':dict(flagCounts),'recordsWithFlags':sum(bool(x['flags']) for x in records),'duplicateTagGroups':sum(len({x['tag'] for x in records if x['plotId']==p['id'] and 'DUPLICATE_TAG_IN_PLOT' in x['flags']}) for p in plots),'formulaErrors':sourceErrors,'recalculationMismatches':recalcFailures,'countTextCells':countText,'numericNotes':noteNumeric,'plotTotalReconciliationPass':all(not set(p['flags']).intersection({'SOURCE_TOTAL_MISMATCH','AREA_NORMALIZATION_MISMATCH','RECALCULATED_TOTAL_MISMATCH'}) for p in plots),'maxAbsoluteRowRecalculationDifferenceTco2e':max(abs(x['calculationDifference'] or 0) for x in records)}}
write('baseline.json',result)
write('formula-catalog.json',{'sourceFile':SRC.name,'formulaDescriptions':{'agbKg':'0.251 × woodDensity × DBH(cm)^2.46','bgbKg':'0.199 × woodDensity^0.899 × DBH(cm)^2.22','stockTco2e':'(AGB + BGB) / 1000 × CF × (44/12)','note':'Reproduces formulas and constants in supplied workbook; not a claim of methodology approval.'},'sheets':{s['name']:{ref:c['f'] for ref,c in s['cells'].items() if c.get('f')} for s in sheets}})
write('extraction-evidence.json',{'meta':meta,'plotSummaries':plots,'qa':result['qa'],'sheetInventory':[{k:s[k] for k in ['name','dimension']} for s in sheets]})
print(json.dumps({'meta':meta,'qa':{k:v for k,v in result['qa'].items() if k not in ['numericNotes']},'bytes':(OUT/'baseline.json').stat().st_size},ensure_ascii=False,indent=2))
