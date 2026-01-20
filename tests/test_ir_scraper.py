
from datetime import date
from earnings.ir_scraper import _extract_candidates, _pick_event

def test_extract_candidates_ignores_generic_financials():
    # This snippet mimics the Merck page structure where "January 20, 2026" is near "Financials"
    padding = " " * 150
    text = (
        f"Investor relations ... NYSE: MRK January 20, 2026 7:05 am ET ... "
        f"Latest news, events & financials News Events ... {padding} "
        f"February 03, 2026 Earnings Q4 2025 Earnings Call"
    )
    
    candidates = _extract_candidates(text)
    
    # We expect the January 20th date to be IGNORED because it's only near "financials" 
    # (which we removed) or no keyword at all.
    # We expect February 03 to be FOUND because it's near "Earnings".
    
    found_dates = [c[0].strftime("%Y-%m-%d") for c in candidates]
    
    assert "2026-02-03" in found_dates
    assert "2026-01-20" not in found_dates

def test_pick_event_selects_correct_earnings():
    # Setup candidates: one false positive (if it were extracted) and one real one
    # But since we shouldn't extract the false positive, let's just ensure if we had
    # a list spanning those dates, the logic holds.
    
    # Real test: verifying _extract_candidates filtering
    padding = " " * 150
    text = f"random text 2026-01-20 random text financial random text {padding} 2026-02-03 Earnings Call"
    candidates = _extract_candidates(text)
    # With 'financial' removed, first one should be skipped
    assert len(candidates) == 1
    assert candidates[0][0] == date(2026, 2, 3)

