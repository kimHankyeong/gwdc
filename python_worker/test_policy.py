import unittest
from main import evaluate, dispatch
class PolicyTests(unittest.TestCase):
 def test_shared_dispatch_ranks_only_allowed_candidates_numerically(self):
  result=dispatch({'operation':'rank','policy':{'preferLowerPrice':True,'preferHigherReviewScore':False},'results':[{'candidateId':'expensive','allowed':True,'total':'100'},{'candidateId':'cheap','allowed':True,'total':'20'},{'candidateId':'denied','allowed':False,'total':'1'}],'policyDigest':'policy','inputDigest':'input'})
  self.assertEqual(result['candidateIds'],['cheap','expensive'])
  self.assertEqual(result['inputDigest'],'input')
 def request(self):
  return {"policy":{"currency":"KRW","minorDigits":0,"maxBudget":"1000","maxPerTransaction":"1000","minimumRemaining":"0","validUntil":"2099-01-01T00:00:00Z","allowedMerchants":[],"blockedMerchants":[],"blockedBrands":[],"minimumReviewScore":None},
   "constraints":{"maxTotal":"1000","quantity":2,"excludedBrands":[]},"facts":{"balance":"1000","spent":"0","reserved":"0","now":"2026-09-29T00:00:00Z","quote":{"quantity":2,"unitPrice":"450","shipping":"100","currency":"KRW","name":"test","merchant":"seller","brand":"brand","rating":None}},
   "policyDigest":"policy","inputDigest":"input"}
 def test_boundary(self):
  r=self.request();self.assertTrue(evaluate(r)["allowed"]);self.assertEqual(evaluate(r)["total"],"1000")
 def test_reservations_not_ignored(self):
  r=self.request();r["facts"]["reserved"]="1";self.assertFalse(evaluate(r)["allowed"])
 def test_spending_survives_policy_change(self):
  r=self.request();r["facts"]["spent"]="1";self.assertIn("BUDGET_LIMIT",evaluate(r)["reasonCodes"])
 def test_review_unknown_is_not_zero_or_pass(self):
  r=self.request();r["policy"]["minimumReviewScore"]=4;self.assertIn("REVIEW_EVIDENCE_MISSING",evaluate(r)["reasonCodes"])
 def test_hardinput(self):
  r=self.request();r["constraints"]["requiredName"]="exact";self.assertIn("EXACT_INPUT_MISMATCH",evaluate(r)["reasonCodes"])
 def test_no_float_amounts(self):
  r=self.request();r["facts"]["quote"]["unitPrice"]="1.2"
  with self.assertRaises(ValueError):evaluate(r)
 def test_expiration(self):
  r=self.request();r["policy"]["validUntil"]=r["facts"]["now"];self.assertIn("POLICY_EXPIRED",evaluate(r)["reasonCodes"])
 def test_currency(self):
  r=self.request();r["facts"]["quote"]["currency"]="USD";self.assertIn("CURRENCY_MISMATCH",evaluate(r)["reasonCodes"])
if __name__=="__main__":unittest.main()
