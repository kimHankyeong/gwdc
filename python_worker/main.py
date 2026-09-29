"""Fixed JSON evaluator. No generated code, shell, network, or policy writes."""
import sys, json
from decimal import Decimal
from datetime import datetime, timezone

def integer(value):
    if not isinstance(value,str) or not value.isdecimal() or len(value)>15:
        raise ValueError("INVALID_AMOUNT")
    return int(value)

def evaluate(req):
    p=req["policy"]; c=req["constraints"]; f=req["facts"]
    reasons=[]
    balance=integer(f["balance"]); spent=integer(f["spent"]); reserved=integer(f["reserved"])
    q=f["quote"]; quantity=q["quantity"]
    if type(quantity)!=int or quantity<1 or quantity>100000: raise ValueError("INVALID_QUANTITY")
    total=quantity*integer(q["unitPrice"])+integer(q["shipping"])
    if q["currency"]!=p["currency"]: reasons.append("CURRENCY_MISMATCH")
    if p["currency"]=="KRW" and p["minorDigits"]!=0: reasons.append("INVALID_CURRENCY_UNITS")
    now=datetime.fromisoformat(f["now"].replace("Z","+00:00"))
    if now>=datetime.fromisoformat(p["validUntil"].replace("Z","+00:00")): reasons.append("POLICY_EXPIRED")
    if total>integer(p["maxPerTransaction"]) or total>integer(c["maxTotal"]): reasons.append("TRANSACTION_LIMIT")
    if total+spent+reserved>integer(p["maxBudget"]): reasons.append("BUDGET_LIMIT")
    if balance-reserved-total<integer(p["minimumRemaining"]): reasons.append("INSUFFICIENT_BALANCE")
    if quantity!=c["quantity"]: reasons.append("QUANTITY_MISMATCH")
    if c.get("requiredName") and q["name"]!=c["requiredName"]: reasons.append("EXACT_INPUT_MISMATCH")
    merchant=q.get("merchant")
    if (p["allowedMerchants"] or p["blockedMerchants"]) and not merchant: reasons.append("MERCHANT_EVIDENCE_MISSING")
    if p["allowedMerchants"] and merchant not in p["allowedMerchants"]: reasons.append("MERCHANT_NOT_ALLOWED")
    if merchant in p["blockedMerchants"]: reasons.append("MERCHANT_BLOCKED")
    brand=q.get("brand")
    if (p["blockedBrands"] or c.get("excludedBrands")) and not brand: reasons.append("BRAND_EVIDENCE_MISSING")
    if brand in p["blockedBrands"] or brand in c.get("excludedBrands",[]): reasons.append("BRAND_BLOCKED")
    if p["minimumReviewScore"] is not None:
        rating=q.get("rating")
        if rating is None: reasons.append("REVIEW_EVIDENCE_MISSING")
        elif Decimal(str(rating))<Decimal(str(p["minimumReviewScore"])): reasons.append("REVIEW_TOO_LOW")
    return {"allowed":not reasons,"reasonCodes":reasons,"total":str(total),
            "remaining":str(balance-reserved-total),"policyDigest":req["policyDigest"],
            "inputDigest":req["inputDigest"]}

def dispatch(req):
    operation=req.get("operation")
    if operation=="evaluate":
        result=evaluate(req)
    elif operation=="rank":
        p=req["policy"]
        permitted=[r for r in req["results"] if r["allowed"]]
        def order(r):
            price=integer(r["total"]) if p["preferLowerPrice"] else 0
            rating=r.get("rating")
            review=(1,Decimal(0)) if rating is None else (0,-Decimal(str(rating)))
            return (price,review if p["preferHigherReviewScore"] else (0,Decimal(0)),r["candidateId"])
        result={"allowed":True,"reasonCodes":[],"candidateIds":[r["candidateId"] for r in sorted(permitted,key=order)],
                "policyDigest":req["policyDigest"],"inputDigest":req["inputDigest"]}
    else: raise ValueError("UNKNOWN_OPERATION")
    return result

def main():
    raw=sys.stdin.buffer.read(262145)
    if len(raw)>262144: raise ValueError("INPUT_TOO_LARGE")
    print(json.dumps(dispatch(json.loads(raw)),separators=(",",":")))

if __name__=="__main__":
    try: main()
    except Exception:
        print(json.dumps({"error":"EVALUATION_FAILED"}))
        sys.exit(1)
