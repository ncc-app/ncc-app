import { useState, useEffect, type ChangeEvent } from 'react';
import { Modal, Form, Button, Row, Col } from 'react-bootstrap';
import toast from 'react-hot-toast';
import { DRIVE_TYPES, DRIVE_TYPE_LABELS, NCC_YEARS, type DriveType } from '@/shared/config/constants';
import type { CreateDriveData } from '@/features/eventDrives/eventDriveService';
import type { EventDrive } from '@/shared/types';
import { toISTDateTimeInputValue } from '@/shared/utils/dateTime';

interface CreateEditDriveModalProps {
  show: boolean;
  onHide: () => void;
  onSave: (data: CreateDriveData) => Promise<void>;
  editDrive?: EventDrive & { id: string };
  createdBy: string;
}

export default function CreateEditDriveModal({
  show,
  onHide,
  onSave,
  editDrive,
  createdBy,
}: CreateEditDriveModalProps) {
  const isEdit = !!editDrive;
  const [loading, setLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [driveType, setDriveType] = useState<string>(DRIVE_TYPES.VOLUNTEERING);
  const [customDriveType, setCustomDriveType] = useState('');
  const [targetNccYear, setTargetNccYear] = useState<string>(NCC_YEARS[0]);
  const [targetDivision, setTargetDivision] = useState<'SD' | 'SW'>('SD');
  const [date, setDate] = useState('');
  const [location, setLocation] = useState('');
  const [capacity, setCapacity] = useState<number | ''>('');
  const [deadline, setDeadline] = useState('');

  useEffect(() => {
    if (show) {
      if (editDrive) {
        setTitle(editDrive.title);
        setDescription(editDrive.description || '');
        setDriveType(editDrive.driveType);
        setCustomDriveType(editDrive.customDriveType || '');
        setTargetNccYear(editDrive.targetNccYear);
        // Fallback to SD if somehow it's not SD or SW
        setTargetDivision((editDrive.targetDivision as 'SD' | 'SW') === 'SW' ? 'SW' : 'SD');
        setDate(editDrive.date);
        setLocation(editDrive.location || '');
        setCapacity(editDrive.capacity ?? '');
        setDeadline(editDrive.deadline ? toISTDateTimeInputValue(new Date(editDrive.deadline)) : '');
      } else {
        setTitle('');
        setDescription('');
        setDriveType(DRIVE_TYPES.VOLUNTEERING);
        setCustomDriveType('');
        setTargetNccYear(NCC_YEARS[0]);
        setTargetDivision('SD');
        setDate('');
        setLocation('');
        setCapacity('');
        setDeadline('');
      }
    }
  }, [show, editDrive]);

  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleSaveClick = () => {
    const newErrors: Record<string, string> = {};
    if (!title.trim()) newErrors.title = 'Title is required';
    if (!date) newErrors.date = 'Date is required';
    if (!deadline) newErrors.deadline = 'Deadline is required';
    
    if (driveType === 'other' && !customDriveType.trim()) {
      newErrors.customDriveType = 'Custom drive type is required';
    }

    const now = new Date();
    // Validate date (must be today or future)
    if (date) {
      const selectedDate = new Date(date);
      const today = new Date();
      today.setHours(0, 0, 0, 0); // Start of today
      if (selectedDate < today) {
        newErrors.date = 'Date cannot be in the past';
      }
    }

    // Validate deadline
    if (deadline) {
      const selectedDeadline = new Date(deadline);
      if (selectedDeadline < now) {
        newErrors.deadline = 'Deadline cannot be in the past';
      }
    }

    setErrors(newErrors);

    if (Object.keys(newErrors).length > 0) return;

    setShowConfirm(true);
  };

  const confirmSave = async () => {
    try {
      setLoading(true);
      const data: CreateDriveData = {
        title: title.trim(),
        description: description.trim() || '',
        driveType,
        customDriveType: driveType === 'other' ? customDriveType.trim() : '',
        targetNccYear,
        targetDivision,
        date,
        location: location.trim() || '',
        capacity: capacity === '' ? null : capacity,
        deadline,
        createdBy,
      };

      await onSave(data);
      setShowConfirm(false);
      onHide();
    } catch (error) {
      console.error(error);
      toast.error(`Failed to ${isEdit ? 'update' : 'create'} event drive`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Modal show={show} onHide={onHide} size="lg">
        <Modal.Header closeButton>
          <Modal.Title>{isEdit ? 'Edit Event Drive' : 'Create Event Drive'}</Modal.Title>
        </Modal.Header>
        <Modal.Body>

          <Form>
            <Row className="mb-3">
              <Col md={12}>
                <Form.Group>
                  <Form.Label>Title <span className="text-danger">*</span></Form.Label>
                  <Form.Control
                    type="text"
                    value={title}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setTitle(e.target.value)}
                    isInvalid={!!errors.title}
                  />
                  <Form.Control.Feedback type="invalid">{errors.title}</Form.Control.Feedback>
                </Form.Group>
              </Col>
            </Row>

            <Row className="mb-3">
              <Col md={12}>
                <Form.Group>
                  <Form.Label>Description</Form.Label>
                  <Form.Control
                    as="textarea"
                    rows={3}
                    value={description}
                    onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setDescription(e.target.value)}
                  />
                </Form.Group>
              </Col>
            </Row>

            <Row className="mb-3">
              <Col md={6}>
                <Form.Group>
                  <Form.Label>Drive Type <span className="text-danger">*</span></Form.Label>
                  <Form.Select
                    value={driveType}
                    onChange={(e: ChangeEvent<HTMLSelectElement>) => setDriveType(e.target.value as DriveType)}
                  >
                    {Object.values(DRIVE_TYPES).map(type => (
                      <option key={type} value={type}>{DRIVE_TYPE_LABELS[type]}</option>
                    ))}
                  </Form.Select>
                </Form.Group>
              </Col>
              {driveType === 'other' && (
                <Col md={6}>
                  <Form.Group>
                    <Form.Label>Custom Drive Type <span className="text-danger">*</span></Form.Label>
                      <Form.Control
                        type="text"
                        value={customDriveType}
                        onChange={(e: ChangeEvent<HTMLInputElement>) => setCustomDriveType(e.target.value)}
                        isInvalid={!!errors.customDriveType}
                      />
                      <Form.Control.Feedback type="invalid">{errors.customDriveType}</Form.Control.Feedback>
                  </Form.Group>
                </Col>
              )}
            </Row>

            <Row className="mb-3">
              <Col md={6}>
                <Form.Group>
                  <Form.Label>Target NCC Year <span className="text-danger">*</span></Form.Label>
                  <Form.Select
                    value={targetNccYear}
                    onChange={(e: ChangeEvent<HTMLSelectElement>) => setTargetNccYear(e.target.value)}
                  >
                    {NCC_YEARS.map(year => (
                      <option key={year} value={year}>{year}</option>
                    ))}
                  </Form.Select>
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group>
                  <Form.Label>Target Division <span className="text-danger">*</span></Form.Label>
                  <div>
                    <Form.Check
                      inline
                      type="radio"
                      label="SD"
                      name="targetDivision"
                      id="division-sd"
                      checked={targetDivision === 'SD'}
                      onChange={() => setTargetDivision('SD')}
                    />
                    <Form.Check
                      inline
                      type="radio"
                      label="SW"
                      name="targetDivision"
                      id="division-sw"
                      checked={targetDivision === 'SW'}
                      onChange={() => setTargetDivision('SW')}
                    />
                  </div>
                </Form.Group>
              </Col>
            </Row>

            <Row className="mb-3">
              <Col md={6}>
                <Form.Group>
                  <Form.Label>Date <span className="text-danger">*</span></Form.Label>
                  <Form.Control
                    type="date"
                    value={date}
                    min={toISTDateTimeInputValue(new Date()).split('T')[0]}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setDate(e.target.value)}
                    isInvalid={!!errors.date}
                  />
                  <Form.Control.Feedback type="invalid">{errors.date}</Form.Control.Feedback>
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group>
                  <Form.Label>Deadline <span className="text-danger">*</span></Form.Label>
                  <Form.Control
                    type="datetime-local"
                    value={deadline}
                    min={toISTDateTimeInputValue(new Date())}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setDeadline(e.target.value)}
                    isInvalid={!!errors.deadline}
                  />
                  <Form.Control.Feedback type="invalid">{errors.deadline}</Form.Control.Feedback>
                </Form.Group>
              </Col>
            </Row>

            <Row className="mb-3">
              <Col md={6}>
                <Form.Group>
                  <Form.Label>Location</Form.Label>
                  <Form.Control
                    type="text"
                    value={location}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setLocation(e.target.value)}
                  />
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group>
                  <Form.Label>Capacity</Form.Label>
                  <Form.Control
                    type="number"
                    min={1}
                    value={capacity}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => {
                      const val = e.target.value;
                      setCapacity(val === '' ? '' : parseInt(val, 10));
                    }}
                  />
                </Form.Group>
              </Col>
            </Row>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={onHide} disabled={loading}>Cancel</Button>
          <Button variant="primary" onClick={handleSaveClick} disabled={loading}>Save</Button>
        </Modal.Footer>
      </Modal>

      <Modal show={showConfirm} onHide={() => !loading && setShowConfirm(false)} centered>
        <Modal.Header closeButton={!loading}>
          <Modal.Title>Confirm Action</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          Are you sure you want to {isEdit ? 'update' : 'create'} this event drive?
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowConfirm(false)} disabled={loading}>
            Cancel
          </Button>
          <Button variant="primary" onClick={confirmSave} disabled={loading}>
            {loading ? 'Confirming...' : 'Confirm'}
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
}
