"""
BambooHR API Client
Handles authentication and API requests to BambooHR
"""
import httpx
import base64
import xml.etree.ElementTree as ET
from typing import Optional, Dict, List, Any
from ..config import settings


def _normalize_bamboohr_id(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, dict):
        return _normalize_bamboohr_id(
            value.get("id")
            or value.get("employeeId")
            or value.get("employee_id")
            or value.get("_text")
        )
    return str(value).strip()


# BambooHR compensation table column order when Accept is omitted (array rows).
# Matches GET /meta/tables labels for this tenant + official field aliases.
COMPENSATION_ARRAY_FIELDS = (
    "startDate",
    "rate",
    "type",
    "exempt",
    "reason",
    "comment",
    "paidPer",
    "paySchedule",
    "overtimeRate",
)


def normalize_compensation_rate(rate: Any) -> str:
    """Extract a numeric pay-rate string from Bamboo rate field (dict or scalar)."""
    if rate is None:
        return ""
    if isinstance(rate, dict):
        value = rate.get("value")
        if value is None or value == "":
            return ""
        return str(value).strip()
    text = str(rate).strip()
    if not text:
        return ""
    # "21.00 CAD" / "$27.00" → keep leading numeric token
    cleaned = text.replace("$", "").replace(",", "").strip()
    parts = cleaned.split()
    return parts[0] if parts else cleaned


def normalize_compensation_pay_type(raw: Any) -> Optional[str]:
    """Map Bamboo pay type labels onto Hub conventions (hourly|salary|contract)."""
    if isinstance(raw, dict):
        raw = raw.get("name") or raw.get("label") or raw.get("_text") or ""
    text = str(raw or "").strip()
    if not text:
        return None
    lower = text.lower()
    if lower in ("hourly", "hour", "hours"):
        return "hourly"
    if lower in ("salary", "salaried", "annual", "yearly", "year", "exempt"):
        return "salary"
    if lower in ("contract", "contractor", "commission"):
        return "contract"
    return lower


def normalize_compensation_row(row: Any) -> Optional[Dict[str, Any]]:
    """
    Normalize a Bamboo compensation table row into a dict with stable keys.

    Handles both named JSON objects (Accept: application/json) and positional
    arrays returned when Accept is omitted.
    """
    if isinstance(row, list):
        mapped: Dict[str, Any] = {}
        for i, name in enumerate(COMPENSATION_ARRAY_FIELDS):
            if i < len(row):
                mapped[name] = row[i]
        row = mapped
    if not isinstance(row, dict):
        return None

    start = row.get("startDate") or row.get("start_date") or row.get("date")
    if not start:
        return None

    rate_raw = row.get("rate") or row.get("payRate") or row.get("pay_rate")
    rate = normalize_compensation_rate(rate_raw)
    if not rate:
        return None

    pay_type = normalize_compensation_pay_type(row.get("type") or row.get("payType"))
    reason = row.get("reason") or row.get("changeReason") or ""
    if isinstance(reason, dict):
        reason = reason.get("name") or reason.get("label") or ""
    comment = row.get("comment") or row.get("comments") or ""
    if comment is None:
        comment = ""

    bamboo_id = _normalize_bamboohr_id(row.get("id") or row.get("rowId"))
    employee_id = _normalize_bamboohr_id(
        row.get("employeeId") or row.get("employee_id") or row.get("employee")
    )

    return {
        "id": bamboo_id or None,
        "employeeId": employee_id or None,
        "startDate": str(start).split("T")[0].strip(),
        "endDate": (str(row.get("endDate") or "").split("T")[0].strip() or None),
        "rate": rate,
        "type": pay_type,
        "type_raw": str(row.get("type") or "").strip() or None,
        "reason": str(reason or "").strip(),
        "comment": str(comment or "").strip(),
        "paidPer": str(row.get("paidPer") or row.get("paid_per") or "").strip() or None,
        "paySchedule": str(row.get("paySchedule") or "").strip() or None,
        "currency": (
            (rate_raw.get("currency") if isinstance(rate_raw, dict) else None)
            or row.get("currency")
        ),
        "_raw": row,
    }


def coerce_compensation_rows(result: Any, employee_id: Optional[str] = None) -> List[Dict[str, Any]]:
    """Flatten Bamboo compensation table payloads into normalized row dicts."""
    rows: List[Any] = []
    if isinstance(result, list):
        rows = result
    elif isinstance(result, dict):
        if "employees" in result and isinstance(result["employees"], dict):
            employees_data = result["employees"]
            if employee_id and employee_id in employees_data:
                emp_data = employees_data[employee_id]
                if isinstance(emp_data, dict) and "rows" in emp_data:
                    rows = emp_data["rows"] if isinstance(emp_data["rows"], list) else [emp_data["rows"]]
                elif isinstance(emp_data, list):
                    rows = emp_data
            else:
                for emp_data in employees_data.values():
                    if isinstance(emp_data, dict) and "rows" in emp_data:
                        chunk = emp_data["rows"]
                        rows.extend(chunk if isinstance(chunk, list) else [chunk])
                    elif isinstance(emp_data, list):
                        rows.extend(emp_data)
        elif "rows" in result:
            rows = result["rows"] if isinstance(result["rows"], list) else [result["rows"]]
        elif "employee" in result and isinstance(result["employee"], dict):
            emp_data = result["employee"]
            if "rows" in emp_data:
                rows = emp_data["rows"] if isinstance(emp_data["rows"], list) else [emp_data["rows"]]
            elif "compensation" in emp_data:
                comp = emp_data["compensation"]
                rows = comp if isinstance(comp, list) else [comp]
        elif any(k in result for k in ("startDate", "rate", "type")):
            rows = [result]

    out: List[Dict[str, Any]] = []
    for row in rows:
        normalized = normalize_compensation_row(row)
        if normalized:
            out.append(normalized)

    out.sort(key=lambda r: (r.get("startDate") or "", r.get("id") or ""))
    return out


def extract_time_off_request_employee_id(req: Dict[str, Any]) -> str:
    """Return the BambooHR employee id from a time-off request payload."""
    if not isinstance(req, dict):
        return ""
    return _normalize_bamboohr_id(
        req.get("employeeId")
        or req.get("employee_id")
        or req.get("employeeID")
        or req.get("employee")
    )


def normalize_time_off_status(status: Any) -> str:
    """BambooHR may return status as a string or as {"status": "approved", ...}."""
    if isinstance(status, dict):
        status = status.get("status") or status.get("_text") or status.get("name") or ""
    return str(status or "").strip().lower()


def coerce_time_off_requests_payload(result: Any) -> List[Dict[str, Any]]:
    """Normalize BambooHR time-off request responses into a list of dicts."""
    if not result:
        return []
    if isinstance(result, list):
        return [r for r in result if isinstance(r, dict)]
    if isinstance(result, dict):
        for key in ("requests", "request", "data"):
            if key not in result:
                continue
            val = result[key]
            if isinstance(val, list):
                return [r for r in val if isinstance(r, dict)]
            if isinstance(val, dict):
                return [val]
        if any(k in result for k in ("employeeId", "employee_id", "start", "startDate", "id")):
            return [result]
    return []


def filter_time_off_requests_for_employee(
    requests: List[Dict[str, Any]], employee_id: str
) -> List[Dict[str, Any]]:
    """
    Keep only rows belonging to employee_id.

    BambooHR's /time_off/requests is company-wide; employeeId on the URL is
    optional and often ignored. Callers MUST filter. Rows without a resolvable
    employee id are dropped (fail-closed) so another person's leave is never
    attributed to the user being synced.
    """
    target = str(employee_id or "").strip()
    if not target:
        return []
    return [
        req for req in requests
        if extract_time_off_request_employee_id(req) == target
    ]


def normalize_time_off_policy_name(raw: Any) -> str:
    """
    Map Bamboo policy/type labels onto MKHub conventions.
    Sick → Sick Leave; vacation/day off/PTO/holiday → Vacation; else keep trimmed text.
    """
    if isinstance(raw, dict):
        raw = (
            raw.get("name")
            or raw.get("policyName")
            or raw.get("type")
            or raw.get("_text")
            or ""
        )
    name = str(raw or "").strip()
    if not name:
        return "Time Off"
    lower = name.lower()
    if "sick" in lower:
        return "Sick Leave"
    if any(token in lower for token in ("vacation", "holiday", "pto", "day off", "dayoff", "annual")):
        return "Vacation"
    if lower in {"time off", "timeoff", "leave"}:
        return "Vacation"
    return name


def parse_time_off_request_notes(req: Dict[str, Any]) -> str:
    """
    Bamboo list-requests returns notes as:
      {"employee": "...", "manager": "..."}  # keys omitted when empty
    Create payloads sometimes use [{"from":"employee","note":"..."}].
    """
    notes_raw = req.get("notes") or req.get("note") or req.get("comment") or ""
    try:
        if isinstance(notes_raw, list):
            parts: List[str] = []
            for item in notes_raw:
                if not isinstance(item, dict):
                    continue
                text = (
                    item.get("note")
                    or item.get("notes")
                    or item.get("comment")
                    or item.get("text")
                    or ""
                )
                text = str(text).strip()
                if not text:
                    continue
                who = str(item.get("from") or item.get("author") or "").strip().lower()
                if who == "manager":
                    parts.append(f"Manager: {text}")
                elif who == "employee":
                    parts.append(text)
                else:
                    parts.append(text)
            return "\n".join(parts).strip()

        if isinstance(notes_raw, dict):
            employee = str(
                notes_raw.get("employee")
                or notes_raw.get("employeeNote")
                or notes_raw.get("note")
                or notes_raw.get("notes")
                or notes_raw.get("comment")
                or notes_raw.get("reason")
                or ""
            ).strip()
            manager = str(
                notes_raw.get("manager")
                or notes_raw.get("managerNote")
                or ""
            ).strip()
            parts = []
            if employee:
                parts.append(employee)
            if manager:
                parts.append(f"Manager: {manager}")
            return "\n".join(parts).strip()

        if isinstance(notes_raw, str):
            return notes_raw.strip()
        return str(notes_raw).strip() if notes_raw else ""
    except Exception:
        return str(notes_raw).strip() if notes_raw else ""


def parse_time_off_request_days(req: Dict[str, Any]) -> float:
    """Best-effort days used for a Bamboo time-off request (always >= 0)."""
    if not isinstance(req, dict):
        return 0.0

    unit_raw = req.get("unit", "")
    if isinstance(unit_raw, dict):
        unit_raw = unit_raw.get("name") or unit_raw.get("_text") or ""
    unit = str(unit_raw or "").lower()

    amount_raw = req.get("amount")
    # Bamboo often returns amount as {"unit": "days", "amount": "1"}
    if isinstance(amount_raw, dict):
        unit_from_amt = amount_raw.get("unit") or amount_raw.get("name") or ""
        if unit_from_amt:
            unit = str(unit_from_amt).lower()
        amount_raw = (
            amount_raw.get("amount")
            or amount_raw.get("value")
            or amount_raw.get("days")
            or amount_raw.get("hours")
        )

    if req.get("hours") is not None and not isinstance(req.get("hours"), dict):
        try:
            return abs(float(req["hours"])) / 8.0
        except (ValueError, TypeError):
            pass

    if amount_raw is not None:
        try:
            amount = abs(float(amount_raw))
            if unit == "hours" or "hour" in unit:
                return amount / 8.0
            return amount
        except (ValueError, TypeError):
            pass

    if req.get("days") is not None:
        try:
            return abs(float(req["days"]))
        except (ValueError, TypeError):
            pass

    start_date = req.get("start") or req.get("startDate")
    end_date = req.get("end") or req.get("endDate")
    if start_date and end_date:
        try:
            from datetime import datetime
            start = datetime.strptime(str(start_date).split("T")[0], "%Y-%m-%d").date()
            end = datetime.strptime(str(end_date).split("T")[0], "%Y-%m-%d").date()
            delta = (end - start).days + 1
            if delta > 0:
                return float(delta)
        except Exception:
            pass
    return 0.0


class BambooHRClient:
    """Client for interacting with BambooHR API"""
    
    def __init__(self, api_key: Optional[str] = None, company_domain: Optional[str] = None):
        self.api_key = api_key or settings.bamboohr_api_key
        self.company_domain = company_domain or settings.bamboohr_subdomain or "mackkirkroofing"
        self.base_url = f"https://{self.company_domain}.bamboohr.com/api/v1"
        
        if not self.api_key:
            raise ValueError("BambooHR API key is required")
    
    def _get_auth_header(self) -> Dict[str, str]:
        """Generate HTTP Basic Auth header for BambooHR API"""
        # BambooHR uses API key as username and any string (like 'x') as password
        credentials = f"{self.api_key}:x"
        encoded = base64.b64encode(credentials.encode()).decode()
        return {"Authorization": f"Basic {encoded}"}
    
    def _request(self, method: str, endpoint: str, **kwargs) -> Any:
        """Make HTTP request to BambooHR API"""
        url = f"{self.base_url}/{endpoint.lstrip('/')}"
        headers = self._get_auth_header()
        headers.update(kwargs.pop("headers", {}))
        
        with httpx.Client(timeout=30.0) as client:
            response = client.request(method, url, headers=headers, **kwargs)
            response.raise_for_status()
            
            # BambooHR returns different content types
            content_type = response.headers.get("content-type", "")
            
            if "application/json" in content_type:
                return response.json()
            elif "text/csv" in content_type:
                return response.text
            elif "application/xml" in content_type or "text/xml" in content_type:
                # Parse XML response
                try:
                    root = ET.fromstring(response.content)
                    return self._xml_to_dict(root)
                except Exception as e:
                    # If XML parsing fails, return raw content
                    return response.content
            else:
                # Try to parse as JSON first, then XML, fallback to bytes
                try:
                    return response.json()
                except Exception:
                    try:
                        root = ET.fromstring(response.content)
                        return self._xml_to_dict(root)
                    except Exception:
                        return response.content
    
    def _xml_to_dict(self, root: ET.Element) -> Any:
        """Convert XML element to dict/list structure"""
        # Special handling for BambooHR directory format
        if root.tag == "directory":
            # Extract employees from directory
            employees_elem = root.find("employees")
            if employees_elem is not None:
                employees = []
                for emp_elem in employees_elem.findall("employee"):
                    emp_dict = {"id": emp_elem.get("id")}
                    for field in emp_elem.findall("field"):
                        field_id = field.get("id")
                        field_value = field.text or ""
                        emp_dict[field_id] = field_value
                    employees.append(emp_dict)
                return employees
            return {}
        
        # Special handling for employee files
        if root.tag == "employee" and root.find("category") is not None:
            # This is the files view structure
            files_list = []
            for category in root.findall("category"):
                category_name = category.find("name")
                category_name_text = category_name.text if category_name is not None else "Other"
                for file_elem in category.findall("file"):
                    file_dict = {
                        "id": file_elem.get("id"),
                        "name": file_elem.find("name").text if file_elem.find("name") is not None else "unknown",
                        "originalFileName": file_elem.find("originalFileName").text if file_elem.find("originalFileName") is not None else None,
                        "size": file_elem.find("size").text if file_elem.find("size") is not None else None,
                        "dateCreated": file_elem.find("dateCreated").text if file_elem.find("dateCreated") is not None else None,
                        "category": category_name_text,
                        "categoryId": category.get("id")
                    }
                    files_list.append(file_dict)
            return files_list
        
        # Special handling for employee detail
        if root.tag == "employee":
            emp_dict = {"id": root.get("id")}
            for field in root.findall("field"):
                field_id = field.get("id")
                field_value = field.text or ""
                emp_dict[field_id] = field_value
            return {"employee": emp_dict}
        
        # Handle fieldset (metadata, can be ignored for directory)
        if root.tag == "fieldset":
            return {}
        
        # For other elements, convert normally
        if len(root) == 0:
            return root.text or "" if root.text else ""
        
        # If all children have the same tag, return a list
        children_tags = [child.tag for child in root]
        if len(set(children_tags)) == 1 and len(children_tags) > 1:
            return [self._xml_to_dict(child) for child in root]
        
        # Otherwise return a dict
        result = {}
        for child in root:
            if child.tag in result:
                # Multiple children with same tag - make it a list
                if not isinstance(result[child.tag], list):
                    result[child.tag] = [result[child.tag]]
                result[child.tag].append(self._xml_to_dict(child))
            else:
                result[child.tag] = self._xml_to_dict(child)
        
        # Add text content if present
        if root.text and root.text.strip():
            if result:
                result["_text"] = root.text.strip()
            else:
                return root.text.strip()
        
        return result
    
    def get_employees_directory(self) -> List[Dict[str, Any]]:
        """Get employee directory - returns list of employees"""
        result = self._request("GET", "/employees/directory")
        # The XML parser should return a list directly for directory
        if isinstance(result, list):
            return result
        elif isinstance(result, dict):
            # Fallback: try to extract employees
            if "employees" in result:
                employees = result["employees"]
                if isinstance(employees, list):
                    return employees
                elif isinstance(employees, dict) and "employee" in employees:
                    emp = employees["employee"]
                    return emp if isinstance(emp, list) else [emp]
            elif "employee" in result:
                emp = result["employee"]
                return emp if isinstance(emp, list) else [emp]
        return []
    
    def get_employee(self, employee_id: str, fields: Optional[List[str]] = None) -> Dict[str, Any]:
        """
        Get employee details
        
        Args:
            employee_id: Employee ID
            fields: Optional list of field names to retrieve (defaults to common fields)
        """
        # If no fields specified, use common fields
        if not fields:
            fields = [
                "firstName", "lastName", "preferredName", "displayName",
                "workEmail", "email", "homeEmail", "personalEmail", "mobilePhone", "homePhone", "workPhone",
                "jobTitle", "department", "division", "location",
                "hireDate", "terminationDate", "status",
                "address1", "address2", "city", "state", "zipCode", "country",
                "dateOfBirth", "gender", "maritalStatus", "nationality",
                "payRate", "payType", "annualAmount", "employmentHistoryStatus",
                "sin", "ssn", "workPermitStatus", "visaStatus",
                "emergencyContactName", "emergencyContactRelationship", "emergencyContactPhone",
                "supervisor", "supervisorId"
            ]
        
        # BambooHR accepts fields as comma-separated query parameter
        endpoint = f"/employees/{employee_id}?fields={','.join(fields)}"
        result = self._request("GET", endpoint)
        
        # Parse XML response to dict
        if isinstance(result, dict):
            # Extract employee data from XML structure
            if "employee" in result:
                emp_data = result["employee"]
                if isinstance(emp_data, dict):
                    # Add ID from XML attribute
                    if "id" not in emp_data:
                        emp_data["id"] = employee_id
                    return emp_data
            return result
        elif isinstance(result, str) and not result.strip():
            # Empty response, return basic structure with ID
            return {"id": employee_id}
        
        return result if isinstance(result, dict) else {"id": employee_id}
    
    def get_employee_photo(self, employee_id: str) -> Optional[bytes]:
        """Get employee photo as binary data"""
        try:
            # Try different photo endpoints
            for endpoint in [f"/employees/{employee_id}/photo", f"/employees/{employee_id}/photo/large", f"/employees/{employee_id}/photo/small"]:
                try:
                    result = self._request("GET", endpoint)
                    if isinstance(result, bytes) and len(result) > 0:
                        return result
                except Exception:
                    continue
            return None
        except Exception as e:
            return None
    
    def get_employee_files(self, employee_id: str) -> List[Dict[str, Any]]:
        """Get list of files/documents for an employee"""
        result = self._request("GET", f"/employees/{employee_id}/files/view")
        # The XML parser should return a list directly for files
        if isinstance(result, list):
            return result
        elif isinstance(result, dict):
            # Try to extract files from employee structure
            if "employee" in result:
                emp = result["employee"]
                if isinstance(emp, dict) and "category" in emp:
                    # Flatten files from categories
                    files = []
                    categories = emp["category"] if isinstance(emp["category"], list) else [emp["category"]]
                    for cat in categories:
                        if isinstance(cat, dict) and "file" in cat:
                            file_list = cat["file"] if isinstance(cat["file"], list) else [cat["file"]]
                            for f in file_list:
                                if isinstance(f, dict):
                                    f["category"] = cat.get("name", "Other")
                                    files.append(f)
                    return files
        return []
    
    def get_employee_file(self, employee_id: str, file_id: str) -> bytes:
        """Download a specific employee file"""
        return self._request("GET", f"/employees/{employee_id}/files/{file_id}")
    
    def get_training_records(self, employee_id: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        Get training records
        
        Args:
            employee_id: Optional employee ID to filter by
        """
        if employee_id:
            return self._request("GET", f"/employees/{employee_id}/training")
        else:
            # Get all training records (may need to iterate through employees)
            # Note: BambooHR API may not support getting all training at once
            # This might need to be done per employee
            raise NotImplementedError("Getting all training records requires iterating through employees")
    
    def get_training_types(self) -> List[Dict[str, Any]]:
        """Get list of training types/categories"""
        return self._request("GET", "/meta/training/types")
    
    def get_custom_fields(self) -> List[Dict[str, Any]]:
        """Get list of custom fields available in the system"""
        return self._request("GET", "/meta/fields")
    
    def get_tables(self) -> List[Dict[str, Any]]:
        """Get list of custom tables"""
        return self._request("GET", "/meta/tables")
    
    def get_table_data(self, table_name: str, employee_id: str) -> Optional[Dict[str, Any]]:
        """Get data from a custom table for an employee. Returns None if the table is missing."""
        endpoints = [
            f"/employees/{employee_id}/tables/{table_name}",
            f"/employees/{employee_id}/tables/{table_name}/data",
        ]
        if table_name.isdigit():
            endpoints.append(f"/employees/{employee_id}/tables/{table_name}")

        for endpoint in endpoints:
            try:
                return self._request("GET", endpoint)
            except httpx.HTTPStatusError as e:
                if e.response.status_code == 404:
                    continue
                raise
            except Exception:
                continue
        return None
    
    def get_employee_table_by_field_id(self, employee_id: str, field_id: str) -> Optional[Dict[str, Any]]:
        """Get custom table data using fieldId directly"""
        # Try different endpoint formats that might work with fieldId
        endpoints_to_try = [
            f"/employees/{employee_id}/tables/{field_id}",
            f"/employees/{employee_id}/fields/{field_id}",
            f"/employees/{employee_id}/custom/{field_id}",
        ]
        
        for endpoint in endpoints_to_try:
            try:
                result = self._request("GET", endpoint)
                if result:
                    return result
            except Exception:
                continue
        
        return None
    
    def get_compensation_history(self, employee_id: str) -> List[Dict[str, Any]]:
        """
        Full compensation table for an employee (all historical rows), oldest→newest.

        Prefer Accept: application/json so Bamboo returns named fields + row ids.
        Falls back to array-shaped responses and normalizes both.
        """
        endpoints = [
            f"/employees/{employee_id}/tables/compensation",
            f"/employees/{employee_id}/table/compensation",
        ]
        last_error = None
        for endpoint in endpoints:
            for accept in ("application/json", None):
                try:
                    kwargs = {"headers": {"Accept": accept}} if accept else {}
                    result = self._request("GET", endpoint, **kwargs)
                    if result is None or (isinstance(result, str) and not result.strip()):
                        continue
                    rows = coerce_compensation_rows(result, employee_id)
                    if rows:
                        return rows
                except Exception as exc:
                    last_error = exc
                    continue
        return []

    def get_compensation(self, employee_id: str) -> Optional[Dict[str, Any]]:
        """
        Most recent active compensation row for an employee.

        Prefers rows with no endDate; otherwise the latest startDate.
        Returns a normalized dict (rate as string, type as Hub pay_type).
        """
        try:
            rows = self.get_compensation_history(employee_id)
            if not rows:
                return None

            active = [r for r in rows if not r.get("endDate")]
            pool = active or rows
            # Already sorted oldest→newest; last is most recent
            return pool[-1]
        except Exception:
            return None
    
    def get_reports(self, report_id: str, format: str = "JSON") -> Any:
        """
        Get a report
        
        Args:
            report_id: Report ID
            format: Output format (JSON, CSV, XLS, PDF)
        """
        return self._request("GET", f"/reports/{report_id}?format={format}")
    
    def get_time_off_requests(self, employee_id: Optional[str] = None, start_date: Optional[str] = None, end_date: Optional[str] = None) -> List[Dict[str, Any]]:
        """Get time off requests, always scoped to employee_id when provided."""
        import logging
        from datetime import datetime
        logger = logging.getLogger(__name__)

        now = datetime.now()
        if not start_date or not end_date:
            # History sync needs more than the current year. Company-wide
            # listings stay on the current year to avoid huge payloads.
            if employee_id:
                merged: List[Dict[str, Any]] = []
                seen_ids: set[str] = set()
                for year in range(now.year - 10, now.year + 1):
                    year_start = f"{year}-01-01"
                    year_end = f"{year}-12-31"
                    chunk = self._fetch_time_off_requests_range(employee_id, year_start, year_end, logger)
                    for req in filter_time_off_requests_for_employee(chunk, employee_id):
                        req_id = str(req.get("id") or "")
                        key = req_id or f"{req.get('start')}:{req.get('end')}:{extract_time_off_request_employee_id(req)}"
                        if key in seen_ids:
                            continue
                        seen_ids.add(key)
                        merged.append(req)
                return merged
            start_date = f"{now.year}-01-01"
            end_date = f"{now.year}-12-31"

        requests = self._fetch_time_off_requests_range(employee_id, start_date, end_date, logger)
        if employee_id:
            requests = filter_time_off_requests_for_employee(requests, employee_id)
        return requests

    def _fetch_time_off_requests_range(
        self,
        employee_id: Optional[str],
        start_date: str,
        end_date: str,
        logger,
    ) -> List[Dict[str, Any]]:
        """
        Fetch BambooHR time-off requests for a date range.

        BambooHR's GET /time_off/requests is a company-wide report. employeeId is
        optional and some fallback URLs ignore it entirely — so callers MUST filter
        by employee after a successful response. An empty list is a valid result
        (this employee has no requests) and must not fall through to unfiltered
        company-wide data.
        """
        json_headers = {"Accept": "application/json"}
        endpoints = []
        if employee_id:
            endpoints = [
                f"/time_off/requests?employeeId={employee_id}&start={start_date}&end={end_date}",
            ]
        endpoints.append(f"/time_off/requests?start={start_date}&end={end_date}")

        last_error = None
        for endpoint in endpoints:
            try:
                result = self._request("GET", endpoint, headers=json_headers)
                parsed = coerce_time_off_requests_payload(result)
                if employee_id:
                    parsed = filter_time_off_requests_for_employee(parsed, employee_id)
                return parsed
            except httpx.HTTPStatusError as e:
                last_error = e
                logger.debug(f"Endpoint {endpoint} returned {e.response.status_code}")
                continue
            except Exception as e:
                last_error = e
                logger.debug(f"Failed to get time off requests from {endpoint}: {str(e)}")
                continue

        logger.warning(
            f"Could not retrieve time off requests for employee {employee_id}. "
            f"Last error: {str(last_error) if last_error else 'Unknown'}"
        )
        return []
    
    def get_time_off_policies(self) -> List[Dict[str, Any]]:
        """Get time off policies"""
        return self._request("GET", "/time_off/policies")

    def _normalize_calculator_balances(self, calc: Any) -> List[Dict[str, Any]]:
        """
        Normalize /employees/{id}/time_off/calculator into Hub policy rows.

        Example payload:
          [{"timeOffType":"85","name":"Sick Leave","units":"days",
            "balance":"5.00","usedYearToDate":"0.00","policyType":"accruing",...}]
        """
        rows: List[Dict[str, Any]] = []
        if isinstance(calc, dict):
            for key in ("balances", "data", "policies", "types"):
                if isinstance(calc.get(key), list):
                    calc = calc[key]
                    break
            else:
                calc = [calc]
        if not isinstance(calc, list):
            return []

        for item in calc:
            if not isinstance(item, dict):
                continue
            name = normalize_time_off_policy_name(
                item.get("name") or item.get("policyName") or item.get("timeOffType")
            )
            units = str(item.get("units") or item.get("unit") or "days").lower()

            def _num(val: Any) -> Optional[float]:
                try:
                    if val is None or val == "":
                        return None
                    return float(val)
                except (TypeError, ValueError):
                    return None

            balance = _num(item.get("balance") or item.get("balanceInDays") or item.get("available"))
            used = _num(
                item.get("usedYearToDate")
                or item.get("used")
                or item.get("usedYtd")
                or item.get("usedToDate")
            ) or 0.0
            if balance is None:
                continue

            if "hour" in units:
                balance_hours = balance
                used_hours = used
            else:
                balance_hours = balance * 8.0
                used_hours = used * 8.0

            accrued_hours = balance_hours + used_hours
            rows.append(
                {
                    "name": name,
                    "balance": balance if "hour" not in units else balance / 8.0,
                    "balanceHours": balance_hours,
                    "used": used_hours,
                    "usedHours": used_hours,
                    "accrued": accrued_hours / 8.0,
                    "accruedHours": accrued_hours,
                    "timeOffTypeId": item.get("timeOffType") or item.get("timeOffTypeId"),
                    "units": units,
                }
            )
        return rows
    
    def get_time_off_balance(self, employee_id: str, year: Optional[int] = None) -> Optional[Dict[str, Any]]:
        """Get time off balance for an employee"""
        import logging
        from datetime import datetime
        logger = logging.getLogger(__name__)
        
        if year is None:
            year = datetime.now().year
        
        try:
            # This Bamboo tenant exposes balances via calculator (days), not /balances.
            try:
                calc = self._request(
                    "GET",
                    f"/employees/{employee_id}/time_off/calculator",
                    headers={"Accept": "application/json"},
                )
                policies = self._normalize_calculator_balances(calc)
                if policies:
                    logger.info(
                        f"Successfully retrieved time off balance from calculator "
                        f"for employee {employee_id} ({len(policies)} policies)"
                    )
                    return {"policies": policies, "_source": "calculator"}
            except Exception as e:
                logger.debug(f"Calculator balance endpoint failed: {e}")

            # Try different possible endpoints (including plural forms and with year parameter)
            endpoints = [
                f"/employees/{employee_id}/time_off/balances",  # Most common format
                f"/employees/{employee_id}/time_off/balances?year={year}",
                f"/employees/{employee_id}/time_off/balance",
                f"/employees/{employee_id}/time_off/balance?year={year}",
                f"/time_off/balances?employeeId={employee_id}",
                f"/time_off/balances?employeeId={employee_id}&year={year}",
                f"/time_off/balance?employeeId={employee_id}",
                f"/time_off/balance?employeeId={employee_id}&year={year}",
            ]
            
            last_error = None
            for endpoint in endpoints:
                try:
                    result = self._request("GET", endpoint)
                    if result:
                        logger.info(f"Successfully retrieved time off balance from {endpoint}")
                        return result
                except httpx.HTTPStatusError as e:
                    # Log 404 specifically but continue trying other endpoints
                    if e.response.status_code == 404:
                        logger.debug(f"Endpoint {endpoint} returned 404 (not found)")
                    else:
                        logger.debug(f"Endpoint {endpoint} returned {e.response.status_code}: {str(e)}")
                    last_error = e
                    continue
                except Exception as e:
                    last_error = e
                    logger.debug(f"Failed to get time off balance from {endpoint}: {str(e)}")
                    continue
            
            # If all balance endpoints fail, try alternative approach using time off requests
            logger.info(f"All balance endpoints failed for employee {employee_id}, trying alternative approach with time off requests")
            try:
                # Try to get balance from time off requests with date range for the year
                start_date = f"{year}-01-01"
                end_date = f"{year}-12-31"
                requests = self.get_time_off_requests(employee_id, start_date=start_date, end_date=end_date)
                if requests and isinstance(requests, list):
                    # Log schema hints (once) to help map fields for this Bamboo tenant
                    try:
                        sample = next((r for r in requests if isinstance(r, dict)), None)
                        if sample:
                            interesting = {}
                            for k, v in sample.items():
                                lk = str(k).lower()
                                if any(s in lk for s in ["balance", "remain", "available", "accrual", "earned", "note", "comment", "reason", "unit"]):
                                    interesting[k] = v
                            logger.info(
                                f"[BambooHR] time_off/requests sample keys (filtered) for employee {employee_id}: {interesting}"
                            )
                    except Exception:
                        pass

                    def _to_float(val: Any) -> Optional[float]:
                        try:
                            if val is None:
                                return None
                            if isinstance(val, (int, float)):
                                return float(val)
                            if isinstance(val, str) and val.strip() != "":
                                return float(val)
                            if isinstance(val, dict):
                                # common patterns: {"value": "1.0"} or {"amount": 1}
                                for kk in ["value", "amount", "hours", "days"]:
                                    if kk in val:
                                        return _to_float(val.get(kk))
                        except Exception:
                            return None
                        return None

                    def _extract_balance_days(req: Dict[str, Any]) -> Optional[float]:
                        # Prefer explicit known names
                        candidates = [
                            "balanceAfter", "balance_after", "balance", "balanceRemaining", "balance_remaining",
                            "remainingBalance", "remaining_balance", "availableBalance", "available_balance",
                            "available", "remaining", "balanceInDays", "balance_days"
                        ]
                        for key in candidates:
                            if key in req:
                                v = _to_float(req.get(key))
                                if v is not None:
                                    # determine unit hints
                                    lk = key.lower()
                                    unit_hint = (req.get("balanceUnit") or req.get("unit") or "").lower()
                                    if "hour" in unit_hint or "hours" in lk or "hour" in lk:
                                        return v / 8.0
                                    return v
                        # Fallback: scan any numeric field that looks like a balance
                        for k, v in req.items():
                            lk = str(k).lower()
                            if "balance" in lk or "remain" in lk or "available" in lk:
                                vv = _to_float(v)
                                if vv is None:
                                    continue
                                unit_hint = (req.get("balanceUnit") or req.get("unit") or "").lower()
                                if "hour" in unit_hint or "hours" in lk or "hour" in lk:
                                    return vv / 8.0
                                return vv
                        return None
                    # Calculate balance from approved requests for current year
                    current_year = datetime.now().year
                    
                    # Group by policy and calculate used hours.
                    # If the requests payload contains any balance-like field, use it to set current balance too.
                    policies = {}
                    for req in requests:
                        if isinstance(req, dict):
                            # Check if request is for current year
                            start_date = req.get("start", "") or req.get("startDate", "")
                            if start_date:
                                try:
                                    req_year = datetime.strptime(start_date.split("T")[0], "%Y-%m-%d").year
                                    if req_year != current_year:
                                        continue
                                except:
                                    pass  # If we can't parse date, include it anyway
                            
                            status = normalize_time_off_status(req.get("status"))
                            if status in ["approved", "taken", "used", "approvedpaid", "approvedunpaid"]:
                                policy_name = req.get("policyName") or req.get("policy") or req.get("type") or req.get("name") or "Time Off"
                                
                                # Log the request to understand the structure
                                logger.debug(f"Processing time off request: {req}")
                                
                                # Try to get hours/days from different fields
                                # Note: BambooHR API typically returns "amount" in days, not hours
                                hours = 0.0
                                
                                # Check for explicit hours field first
                                if "hours" in req and req["hours"] is not None:
                                    try:
                                        hours = abs(float(req["hours"]))
                                    except (ValueError, TypeError):
                                        pass
                                
                                # Check for amount field (usually in days for BambooHR)
                                elif "amount" in req and req["amount"] is not None:
                                    try:
                                        amount = float(req["amount"])
                                        # Check if there's a unit field to determine if it's days or hours
                                        unit_raw = req.get("unit", "")
                                        if isinstance(unit_raw, dict):
                                            unit_raw = unit_raw.get("name") or unit_raw.get("_text") or ""
                                        unit = str(unit_raw or "").lower()
                                        if unit == "hours" or "hour" in unit:
                                            hours = abs(amount)
                                        else:
                                            # Default assumption: amount is in days
                                            hours = abs(amount) * 8.0
                                    except (ValueError, TypeError):
                                        pass
                                
                                # Check for days field
                                elif "days" in req and req["days"] is not None:
                                    try:
                                        days = float(req["days"])
                                        hours = abs(days) * 8.0
                                    except (ValueError, TypeError):
                                        pass
                                
                                # Check for other possible fields
                                elif "timeOffAmount" in req and req["timeOffAmount"] is not None:
                                    try:
                                        amount = float(req["timeOffAmount"])
                                        hours = abs(amount) * 8.0  # Assume days
                                    except (ValueError, TypeError):
                                        pass
                                
                                if hours > 0:
                                    if policy_name not in policies:
                                        policies[policy_name] = {
                                            "name": policy_name,
                                            "used": 0.0,
                                            "usedHours": 0.0,
                                            # We might be able to infer these from request payload (balanceAfter/balance)
                                            "balance": None,       # in days (when available)
                                            "balanceHours": None,  # in hours (when available)
                                            "accrued": None,       # in days (when inferrable)
                                            "accruedHours": None,  # in hours (when inferrable)
                                            "_lastBalanceDate": None,
                                        }
                                    
                                    policies[policy_name]["used"] += hours
                                    policies[policy_name]["usedHours"] += hours
                                    logger.debug(f"Added {hours} hours to policy {policy_name} (total: {policies[policy_name]['usedHours']})")

                                    bal_days = _extract_balance_days(req)
                                    bal_date = req.get("end") or req.get("endDate") or req.get("start") or req.get("startDate")
                                    try:
                                        if bal_days is not None:
                                            # Keep the most recent balance snapshot
                                            prev_date = policies[policy_name].get("_lastBalanceDate")
                                            if prev_date is None or (isinstance(bal_date, str) and isinstance(prev_date, str) and bal_date > prev_date):
                                                policies[policy_name]["balance"] = bal_days
                                                policies[policy_name]["balanceHours"] = bal_days * 8.0
                                                policies[policy_name]["_lastBalanceDate"] = bal_date
                                    except Exception:
                                        pass
                    
                    if policies:
                        # If we still couldn't infer balance from request payload, try to approximate using policy rules.
                        # Many BambooHR tenants don't return balance fields on /time_off/requests.
                        try:
                            policies_payload = self.get_time_off_policies()
                            # Log policy schema hints (once) to help map fields for this Bamboo tenant
                            sample_pol = None
                            if isinstance(policies_payload, list):
                                sample_pol = next((p for p in policies_payload if isinstance(p, dict)), None)
                            elif isinstance(policies_payload, dict):
                                # common wrappers
                                for key in ["policies", "data", "policy"]:
                                    if key in policies_payload and isinstance(policies_payload[key], list):
                                        sample_pol = next((p for p in policies_payload[key] if isinstance(p, dict)), None)
                                        break
                            if sample_pol:
                                interesting = {}
                                for k, v in sample_pol.items():
                                    lk = str(k).lower()
                                    if any(s in lk for s in ["accrual", "annual", "year", "amount", "days", "hours", "unit", "balance"]):
                                        interesting[k] = v
                                logger.info(f"[BambooHR] time_off/policies sample keys (filtered): {interesting}")

                            def _walk_numbers(obj: Any, path: str = "") -> List[tuple]:
                                out: List[tuple] = []
                                if isinstance(obj, dict):
                                    for kk, vv in obj.items():
                                        out.extend(_walk_numbers(vv, f"{path}.{kk}" if path else str(kk)))
                                elif isinstance(obj, list):
                                    for idx, vv in enumerate(obj):
                                        out.extend(_walk_numbers(vv, f"{path}[{idx}]"))
                                else:
                                    vv = _to_float(obj)
                                    if vv is not None:
                                        out.append((path, vv))
                                return out

                            def _infer_annual_days(policy_obj: Dict[str, Any]) -> Optional[float]:
                                # Heuristic scoring: prefer paths that look like annual accrual/amount
                                candidates = _walk_numbers(policy_obj)
                                best = None
                                best_score = -1
                                for pth, val in candidates:
                                    if val <= 0 or val > 365:
                                        continue
                                    lp = pth.lower()
                                    # skip caps/limits/carryover which can look like days
                                    if any(x in lp for x in ["max", "cap", "carry", "limit", "roll", "unused", "exceed"]):
                                        continue
                                    score = 0
                                    if "annual" in lp or "year" in lp or "peryear" in lp:
                                        score += 5
                                    if "accrual" in lp:
                                        score += 4
                                    if "amount" in lp or "days" in lp:
                                        score += 2
                                    if "hours" in lp:
                                        score -= 1
                                    if score > best_score:
                                        best_score = score
                                        best = val
                                return best

                            # Normalize policies list
                            pol_list: List[Dict[str, Any]] = []
                            if isinstance(policies_payload, list):
                                pol_list = [p for p in policies_payload if isinstance(p, dict)]
                            elif isinstance(policies_payload, dict):
                                for key in ["policies", "data"]:
                                    if key in policies_payload:
                                        vv = policies_payload[key]
                                        if isinstance(vv, list):
                                            pol_list = [p for p in vv if isinstance(p, dict)]
                                        elif isinstance(vv, dict):
                                            pol_list = [vv]
                                        break

                            # Build name->policy map
                            name_map = {}
                            for p in pol_list:
                                nm = p.get("name") or p.get("policyName") or p.get("title")
                                if nm:
                                    name_map[str(nm).strip().lower()] = p

                            for p in policies.values():
                                if p.get("balanceHours") is None:
                                    nm = str(p.get("name") or "").strip().lower()
                                    pol_obj = name_map.get(nm)
                                    if pol_obj:
                                        annual_days = _infer_annual_days(pol_obj)
                                        if annual_days is not None:
                                            used_h = float(p.get("usedHours") or 0.0)
                                            used_days = used_h / 8.0
                                            balance_days = annual_days - used_days
                                            p["balance"] = balance_days
                                            p["balanceHours"] = balance_days * 8.0
                                            p["accrued"] = annual_days
                                            p["accruedHours"] = annual_days * 8.0
                                            logger.info(f"[BambooHR] Approximated balance for '{p.get('name')}' using policy accrual: annual_days={annual_days}, used_days={used_days}, balance_days={balance_days}")
                        except Exception:
                            pass

                        # Infer accrued when we have both used + current balance (accrued ~= used + balance)
                        for p in policies.values():
                            try:
                                if p.get("balanceHours") is not None:
                                    used_h = float(p.get("usedHours") or 0.0)
                                    bal_h = float(p.get("balanceHours") or 0.0)
                                    p["accruedHours"] = used_h + bal_h
                                    p["accrued"] = (used_h + bal_h) / 8.0
                            except Exception:
                                pass
                            # remove internal helper
                            p.pop("_lastBalanceDate", None)
                        # Return as list of policies (note: we only have used hours, not the full balance)
                        logger.info(f"Retrieved time off usage from requests for {len(policies)} policies")
                        return {"policies": list(policies.values()), "_source": "requests"}
            except Exception as e:
                logger.debug(f"Alternative approach with requests also failed: {str(e)}")
            
            # Try one more alternative: use whos_out endpoint to get time off information
            try:
                logger.info(f"Trying whos_out endpoint as last resort for employee {employee_id}")
                start_date = f"{year}-01-01"
                end_date = f"{year}-12-31"
                whos_out = self.get_time_off_whos_out(start_date=start_date, end_date=end_date)
                if whos_out and isinstance(whos_out, list):
                    # Filter by employee_id and extract time off info
                    employee_time_off = [entry for entry in whos_out if isinstance(entry, dict) and str(entry.get("employeeId", "")) == str(employee_id)]
                    if employee_time_off:
                        # Group by policy
                        policies = {}
                        for entry in employee_time_off:
                            policy_name = entry.get("policyName") or entry.get("policy") or entry.get("type") or "Time Off"
                            hours = float(entry.get("hours", 0) or entry.get("amount", 0) or 0)
                            
                            if policy_name not in policies:
                                policies[policy_name] = {
                                    "name": policy_name,
                                    "used": 0.0,
                                    "usedHours": 0.0
                                }
                            
                            policies[policy_name]["used"] += hours
                            policies[policy_name]["usedHours"] += hours
                        
                        if policies:
                            logger.info(f"Retrieved time off usage from whos_out for {len(policies)} policies")
                            return {"policies": list(policies.values()), "_source": "whos_out"}
            except Exception as e:
                logger.debug(f"Alternative approach with whos_out also failed: {str(e)}")
            
            logger.warning(f"Could not retrieve time off balance for employee {employee_id}. Last error: {str(last_error) if last_error else 'Unknown'}")
            return None
        except Exception as e:
            logger.error(f"Error getting time off balance: {str(e)}")
            return None
    
    def get_time_off_whos_out(self, start_date: Optional[str] = None, end_date: Optional[str] = None) -> List[Dict[str, Any]]:
        """Get who's out (time off) for a date range"""
        endpoint = "/time_off/whos_out"
        params = []
        if start_date:
            params.append(f"start={start_date}")
        if end_date:
            params.append(f"end={end_date}")
        if params:
            endpoint += "?" + "&".join(params)
        return self._request("GET", endpoint)
    
    def get_time_off_calculator(
        self, employee_id: str, end: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Point-in-time balances from /employees/{id}/time_off/calculator.

        Optional ``end=YYYY-MM-DD`` returns the balance as of that date. Bamboo's
        public API has no Balance History GET; this is how we reconstruct ledger
        mutations (accruals / adjustments / carryover) over time.
        """
        import time

        endpoint = f"/employees/{employee_id}/time_off/calculator?precision=2"
        if end:
            endpoint += f"&end={end}"

        last_exc: Optional[Exception] = None
        for attempt in range(4):
            try:
                result = self._request(
                    "GET", endpoint, headers={"Accept": "application/json"}
                )
                if isinstance(result, list):
                    return result
                if isinstance(result, dict):
                    for key in ("balances", "data", "policies", "types"):
                        if isinstance(result.get(key), list):
                            return result[key]
                    return [result]
                return []
            except Exception as exc:
                last_exc = exc
                msg = str(exc)
                retryable = any(code in msg for code in ("502", "503", "504", "429"))
                if not retryable or attempt == 3:
                    raise
                time.sleep(1.5 * (attempt + 1))
        if last_exc:
            raise last_exc
        return []

    def get_time_off_balance_history(self, employee_id: str, policy_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """Get time off balance history/transactions for an employee (often unavailable)."""
        try:
            # Bamboo documents POST/PUT history items but no public Balance History GET.
            # Keep a short probe for tenants that expose one; callers fall back to calculator.
            endpoints = [
                f"/time_off/balance/history?employeeId={employee_id}",
                f"/employees/{employee_id}/time_off/balance/history",
                f"/time_off/balances/history?employeeId={employee_id}",
            ]
            if policy_id:
                endpoints.insert(
                    0,
                    f"/time_off/balance/history?employeeId={employee_id}&policyId={policy_id}",
                )
            for endpoint in endpoints:
                try:
                    result = self._request("GET", endpoint)
                    if result:
                        return result
                except Exception:
                    continue
            return None
        except Exception:
            return None
    
    def get_benefits(self, employee_id: str) -> Dict[str, Any]:
        """Get employee benefits"""
        return self._request("GET", f"/employees/{employee_id}/benefits")
    
    def get_goals(self, employee_id: str) -> List[Dict[str, Any]]:
        """Get employee goals"""
        return self._request("GET", f"/employees/{employee_id}/goals")
    
    def get_employee_metadata(self) -> Dict[str, Any]:
        """Get metadata about employee fields and structure"""
        return {
            "fields": self.get_custom_fields(),
            "tables": self.get_tables(),
            "training_types": self.get_training_types(),
        }

