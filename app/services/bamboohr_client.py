"""
BambooHR API Client
Handles authentication and API requests to BambooHR
"""
import httpx
import base64
import xml.etree.ElementTree as ET
from typing import Optional, Dict, List, Any
from ..config import settings


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
    
    def get_table_data(self, table_name: str, employee_id: str) -> List[Dict[str, Any]]:
        """Get data from a custom table for an employee"""
        return self._request("GET", f"/employees/{employee_id}/tables/{table_name}")
    
    def get_compensation(self, employee_id: str) -> Optional[Dict[str, Any]]:
        """
        Get compensation data for an employee from the compensation table
        
        Returns the most recent active compensation record (endDate is null or most recent)
        """
        try:
            # Try different possible endpoints
            endpoints = [
                f"/employees/{employee_id}/tables/compensation",
                f"/employees/{employee_id}/table/compensation",
            ]
            
            result = None
            for endpoint in endpoints:
                try:
                    result = self._request("GET", endpoint)
                    if result and (isinstance(result, (dict, list)) or (isinstance(result, str) and result.strip())):
                        break
                except Exception:
                    continue
            
            if not result or (isinstance(result, str) and not result.strip()):
                return None
            
            # Handle different response formats
            rows = []
            
            if isinstance(result, list):
                rows = result
            elif isinstance(result, dict):
                # Check if it's the format from the documentation: { "table": "compensation", "employees": { "id": { "rows": [...] } } }
                if "employees" in result:
                    employees_data = result["employees"]
                    if isinstance(employees_data, dict) and employee_id in employees_data:
                        emp_data = employees_data[employee_id]
                        if isinstance(emp_data, dict) and "rows" in emp_data:
                            rows = emp_data["rows"] if isinstance(emp_data["rows"], list) else [emp_data["rows"]]
                # Check if it's a direct rows format
                elif "rows" in result:
                    rows = result["rows"] if isinstance(result["rows"], list) else [result["rows"]]
                # Check if it's wrapped in employee
                elif "employee" in result:
                    emp_data = result["employee"]
                    if isinstance(emp_data, dict):
                        if "rows" in emp_data:
                            rows = emp_data["rows"] if isinstance(emp_data["rows"], list) else [emp_data["rows"]]
                        elif "compensation" in emp_data:
                            comp_data = emp_data["compensation"]
                            rows = comp_data if isinstance(comp_data, list) else [comp_data]
            
            if not rows:
                return None
            
            # Find the most recent active compensation (endDate is null or most recent)
            active_compensation = None
            most_recent_date = None
            
            for row in rows:
                if isinstance(row, dict):
                    end_date = row.get("endDate")
                    start_date = row.get("startDate")
                    
                    # Prefer records with no end date (active)
                    if end_date is None or end_date == "":
                        if active_compensation is None or (start_date and start_date > (most_recent_date or "")):
                            active_compensation = row
                            most_recent_date = start_date
                    # Otherwise, use the most recent one
                    elif start_date and (most_recent_date is None or start_date > most_recent_date):
                        if active_compensation is None or active_compensation.get("endDate"):
                            active_compensation = row
                            most_recent_date = start_date
            
            # If no active record found, use the most recent one
            if active_compensation is None and rows:
                active_compensation = rows[0]
            
            return active_compensation
            
        except Exception as e:
            # Compensation table might not exist or employee might not have compensation data
            return None
    
    def get_reports(self, report_id: str, format: str = "JSON") -> Any:
        """
        Get a report
        
        Args:
            report_id: Report ID
            format: Output format (JSON, CSV, XLS, PDF)
        """
        return self._request("GET", f"/reports/{report_id}?format={format}")
    
    def get_time_off_requests(self, employee_id: Optional[str] = None) -> List[Dict[str, Any]]:
        """Get time off requests"""
        endpoint = "/time_off/requests"
        if employee_id:
            endpoint += f"?employeeId={employee_id}"
        return self._request("GET", endpoint)
    
    def get_time_off_policies(self) -> List[Dict[str, Any]]:
        """Get time off policies"""
        return self._request("GET", "/time_off/policies")
    
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

